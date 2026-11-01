// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A stable release publishes only from a cut commit whose canonical
 * release-check passed.
 *
 * @input  a stubbed GitHub REST client with ci.yml runs and their jobs
 * @output proofs that the receipt is the exact commit's passing release-check
 *   join, and that anything else fails naming main's last checked commit
 *   (spec:AST-030 FR12, DEC-11)
 * @position focused suite for scripts/release/release-check-receipt.mjs
 */

import {describe, expect, it} from 'vitest';
import {
  findReleaseCheck,
  requireReleaseCheck,
} from './release-check-receipt.mjs';

const CUT = 'c'.repeat(40);
const OTHER = 'd'.repeat(40);

const run = (id, headSha, conclusion = 'success') => ({
  id,
  head_sha: headSha,
  conclusion,
  html_url: `https://github.com/o/r/actions/runs/${id}`,
});
const join = conclusion => ({name: 'release-check', conclusion});

/** `runs` are newest first; `jobs` maps a run id to its jobs. */
function fake({runs = [], jobs = {}} = {}) {
  const listed = [];
  return {
    listed,
    github: {
      rest: {
        actions: {
          listWorkflowRuns: async params => {
            listed.push(params);
            return {
              data: {
                workflow_runs: runs.filter(
                  item =>
                    (!params.head_sha || item.head_sha === params.head_sha) &&
                    item.conclusion === params.status,
                ),
              },
            };
          },
          listJobsForWorkflowRun: async ({run_id}) => ({
            data: {jobs: jobs[run_id] ?? []},
          }),
        },
      },
    },
  };
}

async function require_(options, sha = CUT) {
  const {github, listed} = fake(options);
  const messages = {info: [], failed: []};
  const core = {
    info: message => messages.info.push(message),
    setFailed: message => messages.failed.push(message),
  };
  const result = await requireReleaseCheck({
    github,
    core,
    owner: 'o',
    repo: 'r',
    sha,
  });
  return {result, messages, listed};
}

describe('the release-check receipt for a cut commit', () => {
  it('accepts the exact cut commit whose release-check join passed', async () => {
    const {result, messages, listed} = await require_({
      runs: [run(7, CUT)],
      jobs: {7: [join('success')]},
    });
    expect(result.id).toBe(7);
    expect(messages.failed).toEqual([]);
    expect(listed[0]).toEqual({
      owner: 'o',
      repo: 'r',
      workflow_id: 'ci.yml',
      event: 'workflow_dispatch',
      branch: 'main',
      status: 'success',
      per_page: 30,
      head_sha: CUT,
    });
  });

  it('does not take a maintenance capture of the same commit for a release-check', async () => {
    const {github} = fake({
      runs: [run(8, CUT), run(7, CUT)],
      jobs: {
        8: [{name: 'maintenance-request', conclusion: 'success'}],
        7: [join('success')],
      },
    });
    expect(
      (await findReleaseCheck({github, owner: 'o', repo: 'r', sha: CUT})).id,
    ).toBe(7);
  });

  it("fails naming main's last checked commit when the cut commit has no passing release-check", async () => {
    const {result, messages} = await require_({
      runs: [run(9, CUT, 'failure'), run(8, OTHER)],
      jobs: {9: [join('failure')], 8: [join('success')]},
    });
    expect(result).toBeNull();
    expect(messages.failed).toEqual([
      `No passing release-check for the cut commit ${CUT}. Re-cut the release from main's last commit with a passing release-check, ${OTHER}, or wait for main's next check and cut from it.`,
    ]);
  });

  it('fails when the run passed but its release-check join did not run', async () => {
    const {result, messages} = await require_({
      runs: [run(7, CUT)],
      jobs: {7: [join('skipped')]},
    });
    expect(result).toBeNull();
    expect(messages.failed[0]).toMatch(
      /^No passing release-check for the cut commit/,
    );
    expect(messages.failed[0]).toMatch(
      /No main commit has a passing release-check/,
    );
  });

  it('refuses a cut commit that is not a full SHA', async () => {
    const {result, messages, listed} = await require_({}, 'main');
    expect(result).toBeNull();
    expect(listed).toEqual([]);
    expect(messages.failed).toEqual([
      "The release marker's cut commit is not a full SHA: main",
    ]);
  });
});
