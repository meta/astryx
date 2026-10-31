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
  requireUnitRun,
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
function fake({runs = [], units, jobs = {}} = {}) {
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
                workflow_runs: (params.workflow_id === 'deploy.yml'
                  ? (units ?? runs)
                  : runs
                ).filter(
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

  it("fails naming main's last commit with both receipts when the cut commit has no passing release-check", async () => {
    const NEWER = 'e'.repeat(40);
    const {result, messages} = await require_({
      // NEWER passed its release-check but its unit run failed.
      runs: [run(10, NEWER), run(9, CUT, 'failure'), run(8, OTHER)],
      units: [run(21, NEWER, 'failure'), run(20, OTHER)],
      jobs: {
        10: [join('success')],
        9: [join('failure')],
        8: [join('success')],
        20: [
          {name: 'test-ui (1/4)', conclusion: 'success'},
          {name: 'test-node (1/4)', conclusion: 'success'},
        ],
      },
    });
    expect(result).toBeNull();
    expect(messages.failed).toEqual([
      `No passing release-check for the cut commit ${CUT}. Re-cut the release from main's last commit with both a passing release-check and a passing full unit run, ${OTHER}, or wait for main's next checks and cut from them.`,
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
      /No recent main commit has both a passing release-check and a passing full unit run/,
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

describe('the full unit run receipt for a cut commit (spec:AST-030 FR21)', () => {
  const legs = conclusion => [
    ...[1, 2, 3, 4].map(n => ({name: `test-ui (${n})`, conclusion})),
    ...[1, 2, 3, 4].map(n => ({name: `test-node (${n})`, conclusion})),
    {name: 'typecheck', conclusion: 'success'},
  ];
  async function unit(options, sha = CUT) {
    const {github, listed} = fake(options);
    const messages = {info: [], failed: []};
    const core = {
      info: message => messages.info.push(message),
      setFailed: message => messages.failed.push(message),
    };
    const result = await requireUnitRun({
      github,
      core,
      owner: 'o',
      repo: 'r',
      sha,
    });
    return {result, messages, listed};
  }

  it("accepts the cut commit's run where every unit leg passed", async () => {
    const {result, messages, listed} = await unit({
      runs: [run(5, CUT)],
      jobs: {5: legs('success')},
    });
    expect(result.id).toBe(5);
    expect(messages.failed).toEqual([]);
    expect(listed[0]).toEqual({
      owner: 'o',
      repo: 'r',
      workflow_id: 'deploy.yml',
      branch: 'main',
      status: 'success',
      head_sha: CUT,
      per_page: 30,
    });
  });

  it('does not take a push run, whose unit legs skipped, for a unit run', async () => {
    const {result, messages} = await unit({
      runs: [run(6, CUT)],
      jobs: {6: legs('skipped')},
    });
    expect(result).toBeNull();
    expect(messages.failed).toEqual([
      `No passing full unit run for the cut commit ${CUT}. No recent main commit has both a passing release-check and a passing full unit run; wait for main's next checks and cut from them.`,
    ]);
  });

  it('refuses a run with no unit legs at all', async () => {
    const {result} = await unit({
      runs: [run(7, CUT)],
      jobs: {7: [{name: 'typecheck', conclusion: 'success'}]},
    });
    expect(result).toBeNull();
  });

  it("ignores another commit's passing run", async () => {
    const {result} = await unit({
      runs: [run(8, OTHER)],
      jobs: {8: legs('success')},
    });
    expect(result).toBeNull();
  });
});
