// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The issue that reports the daily platform-only run
 *   (platform-only-report.mjs): each leg's verdict from its job, the run's
 *   verdict, and the one issue it opens, comments on or closes.
 */

import {describe, expect, it} from 'vitest';
import {
  ISSUE_TITLE,
  legVerdicts,
  reportPlatformOnly,
  runVerdict,
} from './platform-only-report.mjs';

const job = (os, conclusion) => ({name: `platform-only (${os})`, conclusion});

/**
 * @param {Array<{name: string, conclusion: string | null}>} jobs
 * @param {Array<object>} [openIssues]
 */
function fakeGithub(jobs, openIssues = []) {
  /** @type {Array<[string, any]>} */
  const calls = [];
  return {
    calls,
    rest: {
      actions: {
        listJobsForWorkflowRun: async args => {
          calls.push(['jobs', args]);
          return {data: {jobs}};
        },
      },
      search: {
        issuesAndPullRequests: async ({q}) => {
          calls.push(['search', q]);
          return {data: {items: openIssues}};
        },
      },
      issues: {
        create: async args => calls.push(['create', args]),
        createComment: async args => calls.push(['comment', args]),
        update: async args => calls.push(['update', args]),
      },
    },
  };
}
const context = {
  repo: {owner: 'meta', repo: 'astryx'},
  runId: 42,
  serverUrl: 'https://github.com',
};
const runUrl = 'https://github.com/meta/astryx/actions/runs/42';
const ours = {
  number: 9,
  title: ISSUE_TITLE,
  user: {login: 'github-actions[bot]'},
};

describe('legVerdicts', () => {
  it("reads each leg's verdict from its job's conclusion", () => {
    expect(
      legVerdicts([
        job('windows-latest', 'failure'),
        job('macos-latest', 'success'),
      ]).map(leg => leg.verdict),
    ).toEqual(['fail', 'pass']);
    expect(legVerdicts([job('windows-latest', 'timed_out')])[0].verdict).toBe(
      'fail',
    );
  });

  it('fails a leg its time limit cancelled, such as a hung one', () => {
    // The report job runs only when the run itself was not cancelled.
    expect(legVerdicts([job('windows-latest', 'cancelled')])[0].verdict).toBe(
      'fail',
    );
  });

  it('gives no verdict to a skipped or missing leg', () => {
    expect(
      legVerdicts([
        job('windows-latest', 'skipped'),
        job('macos-latest', 'skipped'),
      ]).map(leg => leg.verdict),
    ).toEqual(['none', 'none']);
    expect(legVerdicts([]).map(leg => leg.verdict)).toEqual(['none', 'none']);
  });
});

describe('runVerdict', () => {
  it('fails on any failed leg, else gives none on any leg with none', () => {
    expect(runVerdict([{verdict: 'pass'}, {verdict: 'fail'}])).toBe('fail');
    expect(runVerdict([{verdict: 'none'}, {verdict: 'fail'}])).toBe('fail');
    expect(runVerdict([{verdict: 'pass'}, {verdict: 'none'}])).toBe('none');
    expect(runVerdict([{verdict: 'pass'}, {verdict: 'pass'}])).toBe('pass');
  });
});

describe('the one issue', () => {
  it('a failed run opens it, naming the failed case and the run only', async () => {
    const github = fakeGithub([
      job('windows-latest', 'failure'),
      job('macos-latest', 'success'),
    ]);
    expect(await reportPlatformOnly({github, context})).toBe('created');
    expect(github.calls[0]).toEqual([
      'jobs',
      expect.objectContaining({run_id: 42}),
    ]);
    const [, created] = github.calls.at(-1);
    expect(created.title).toBe(ISSUE_TITLE);
    expect(created.body).toContain(
      '"reads Windows drive paths" (windows-latest)',
    );
    expect(created.body).toContain(runUrl);
    expect(created.body).not.toContain('SF Symbols');
    // Public repository: the run link is the only link.
    expect(created.body.match(/https?:\/\/\S+/g)).toEqual([`${runUrl}).`]);
  });

  it('a failed run comments on the open issue rather than opening another', async () => {
    const github = fakeGithub(
      [job('windows-latest', 'success'), job('macos-latest', 'failure')],
      [ours],
    );
    expect(await reportPlatformOnly({github, context})).toBe('commented');
    expect(github.calls.filter(([kind]) => kind === 'create')).toEqual([]);
  });

  it('a passing run closes the open issue', async () => {
    const github = fakeGithub(
      [job('windows-latest', 'success'), job('macos-latest', 'success')],
      [ours],
    );
    expect(await reportPlatformOnly({github, context})).toBe('closed');
    expect(github.calls.at(-1)).toEqual([
      'update',
      expect.objectContaining({issue_number: 9, state: 'closed'}),
    ]);
  });

  it("leaves a person's issue of the same title alone", async () => {
    const github = fakeGithub(
      [job('windows-latest', 'success'), job('macos-latest', 'success')],
      [{...ours, user: {login: 'someone'}}],
    );
    expect(await reportPlatformOnly({github, context})).toBe('none');
  });

  it('a run with no verdict only notes it on the open issue', async () => {
    const github = fakeGithub(
      [job('windows-latest', 'skipped'), job('macos-latest', 'success')],
      [ours],
    );
    expect(await reportPlatformOnly({github, context})).toBe(
      'no verdict noted',
    );
    const writes = github.calls.filter(
      ([kind]) => kind === 'comment' || kind === 'update' || kind === 'create',
    );
    expect(writes).toHaveLength(1);
    expect(writes[0][1].body).toMatch(/^No verdict/);
  });
});
