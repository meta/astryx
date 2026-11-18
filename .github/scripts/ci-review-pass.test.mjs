// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ci-review-pass.test.mjs
 * @input .github/scripts/lib/heavy-turn.mjs and
 *   .github/workflows/ci-review-pass.yml run against a stub GitHub
 * @output Proof that a pull request's heavy suites start once, at the first
 *   head whose review passes, by re-running the run that deferred them
 * @position Node coverage for the review-pass start (spec:AST-030/DEC-32, FR20)
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it, vi} from 'vitest';
import yaml from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const HEAVY_MODULE = path.join(root, '.github/scripts/lib/heavy-turn.mjs');
const turn = await import(HEAVY_MODULE);
const workflow = yaml.parse(
  fs.readFileSync(
    path.join(root, '.github/workflows/ci-review-pass.yml'),
    'utf8',
  ),
);
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

const deferredJobs = [
  {
    name: 'heavy-ci',
    steps: [
      {
        name: 'Defer the heavy suites unless the change is spec-only or Lab-only',
        conclusion: 'success',
      },
    ],
  },
  {name: 'test', steps: [{name: 'Heavy CI deferred', conclusion: 'failure'}]},
];
const ranJobs = [
  {
    name: 'test',
    steps: [
      {name: 'Heavy CI deferred', conclusion: 'skipped'},
      {name: 'Require expected test-owner outcomes', conclusion: 'success'},
    ],
  },
];

/** A stub GitHub with pull requests, CI runs, their jobs and statuses. */
const APP = 'astracat-bot[bot]';
const REVIEW = {engOwners: ['owner1'], reviewApp: APP};
/** The review app's approval of a head. */
const appApproval = sha => ({
  user: {login: APP, type: 'Bot'},
  commit_id: sha,
  state: 'APPROVED',
});

function stubGithub({
  pulls = [],
  runs = [],
  jobs = {},
  statuses = {},
  reviews = null,
  permission = 'write',
}) {
  const calls = {reRunWorkflow: [], listWorkflowRuns: []};
  const github = {
    paginate: async (method, options) => (await method(options)).data,
    rest: {
      pulls: {
        // By default the review app approved each pull request's head.
        listReviews: async ({pull_number}) => ({
          data:
            reviews?.[pull_number] ??
            [pulls.find(pull => pull.number === pull_number)]
              .filter(Boolean)
              .map(pull => appApproval(pull.head.sha)),
        }),
        get: async ({pull_number}) => ({
          data: pulls.find(pull => pull.number === pull_number),
        }),
        // `head` is OWNER:branch, as GitHub takes it.
        list: async ({head, state}) => {
          expect(state).toBe('open');
          return {
            data: pulls.filter(
              pull => `${pull.head.owner ?? 'o'}:${pull.head.ref}` === head,
            ),
          };
        },
      },
      repos: {
        getCollaboratorPermissionLevel: async () => ({data: {permission}}),
        listCommitStatusesForRef: async ({ref}) => ({
          data:
            typeof statuses[ref] === 'function'
              ? statuses[ref]()
              : (statuses[ref] ?? []),
        }),
      },
      actions: {
        listWorkflowRuns: async options => {
          calls.listWorkflowRuns.push(options);
          expect(options).toMatchObject({
            workflow_id: 'ci.yml',
            event: 'pull_request',
          });
          return {
            data: {
              workflow_runs: runs.filter(
                run =>
                  (options.head_sha == null ||
                    run.head_sha === options.head_sha) &&
                  (options.status == null || run.conclusion === options.status),
              ),
            },
          };
        },
        listJobsForWorkflowRun: async ({run_id, filter}) => {
          expect(filter).toBe('latest');
          return {data: {jobs: jobs[run_id] ?? []}};
        },
        reRunWorkflow: async ({run_id}) => {
          calls.reRunWorkflow.push(run_id);
        },
      },
    },
  };
  return {github, calls};
}

const passed = [{context: 'review-required', state: 'success'}];
const pending = [{context: 'review-required', state: 'pending'}];
const pull = (number, sha, extra = {}) => ({
  number,
  state: 'open',
  base: {ref: 'main'},
  head: {sha},
  user: {login: 'author'},
  ...extra,
});
const ciRun = (id, sha, extra = {}) => ({
  id,
  head_sha: sha,
  created_at: '2026-11-17T12:00:00Z',
  run_attempt: 1,
  status: 'completed',
  conclusion: 'failure',
  pull_requests: [],
  ...extra,
});

describe('a deferred run', () => {
  it('is one whose required check failed at the deferral step', () => {
    expect(turn.deferred(deferredJobs)).toBe(true);
    expect(turn.deferred(ranJobs)).toBe(false);
    expect(turn.deferred([])).toBe(false);
  });
});

describe('starting the heavy suites', () => {
  it('re-runs the deferred run in full once review passes at the head', async () => {
    const stub = stubGithub({
      pulls: [pull(1, 'h1')],
      runs: [ciRun(11, 'h1')],
      jobs: {11: deferredJobs},
      statuses: {h1: passed},
    });
    const said = await turn.startHeavy({
      ...REVIEW,
      ...stub,
      owner: 'o',
      repo: 'r',
      pull: pull(1, 'h1'),
    });
    expect(stub.calls.reRunWorkflow).toEqual([11]);
    expect(said).toContain('started run 11 again in full');
  });

  it.each([
    [
      'review has not passed',
      {
        runs: [ciRun(11, 'h1')],
        jobs: {11: deferredJobs},
        statuses: {h1: pending},
      },
    ],
    [
      'the run still runs',
      {
        runs: [ciRun(11, 'h1', {status: 'in_progress', conclusion: null})],
        jobs: {11: deferredJobs},
        statuses: {h1: passed},
      },
    ],
    [
      'the run already ran again in full',
      {
        runs: [ciRun(11, 'h1', {run_attempt: 2, conclusion: 'success'})],
        jobs: {11: ranJobs},
        statuses: {h1: passed},
      },
    ],
    [
      'the run ran its heavy suites',
      {runs: [ciRun(11, 'h1')], jobs: {11: ranJobs}, statuses: {h1: passed}},
    ],
    ['there is no run', {runs: [], statuses: {h1: passed}}],
  ])('starts nothing when %s', async (_, data) => {
    const stub = stubGithub(data);
    await turn.startHeavy({
      ...REVIEW,
      ...stub,
      owner: 'o',
      repo: 'r',
      pull: pull(1, 'h1'),
    });
    expect(stub.calls.reRunWorkflow).toEqual([]);
  });

  it.each([
    [
      'the review app approved the exact head of a write-access author',
      {},
      [11],
    ],
    [
      'an engineering owner approved the exact head',
      {
        reviews: {
          1: [{user: {login: 'Owner1'}, commit_id: 'h1', state: 'APPROVED'}],
        },
        permission: 'read',
      },
      [11],
    ],
    [
      "the gate passed at the author's own push, with no review of the head",
      {reviews: {1: []}},
      [],
    ],
    [
      'the review app approved an earlier head only',
      {reviews: {1: [appApproval('h0')]}},
      [],
    ],
    [
      'the review app approved, but the author has no write access',
      {permission: 'read'},
      [],
    ],
    [
      'a lookalike of the review app approved',
      {
        reviews: {
          1: [
            {
              user: {login: APP, type: 'User'},
              commit_id: 'h1',
              state: 'APPROVED',
            },
          ],
        },
      },
      [],
    ],
  ])(
    'reads the review as DEC-11 does: starts when %s',
    async (_, data, expected) => {
      const stub = stubGithub({
        pulls: [pull(1, 'h1')],
        runs: [ciRun(11, 'h1')],
        jobs: {11: deferredJobs},
        statuses: {h1: passed},
        ...data,
      });
      await turn.startHeavy({
        ...REVIEW,
        ...stub,
        owner: 'o',
        repo: 'r',
        pull: pull(1, 'h1'),
      });
      expect(stub.calls.reRunWorkflow).toEqual(expected);
    },
  );

  it('re-runs a run that "Re-run failed jobs" left deferred', async () => {
    // A failed-jobs re-run keeps heavy-ci's deferred output, so its required
    // checks still fail at the deferral step on the later attempt.
    const stub = stubGithub({
      pulls: [pull(1, 'h1')],
      runs: [ciRun(11, 'h1', {run_attempt: 2})],
      jobs: {11: deferredJobs},
      statuses: {h1: passed},
    });
    await turn.startHeavy({
      ...REVIEW,
      ...stub,
      owner: 'o',
      repo: 'r',
      pull: pull(1, 'h1'),
    });
    expect(stub.calls.reRunWorkflow).toEqual([11]);
  });

  it("reads the newest run at the head, not an older head's", async () => {
    const stub = stubGithub({
      pulls: [pull(1, 'h1')],
      runs: [
        ciRun(10, 'old'),
        ciRun(11, 'h1', {created_at: '2026-11-17T11:00:00Z'}),
        ciRun(12, 'h1', {created_at: '2026-11-17T13:00:00Z'}),
      ],
      jobs: {10: deferredJobs, 11: deferredJobs, 12: deferredJobs},
      statuses: {h1: passed},
    });
    await turn.startHeavy({
      ...REVIEW,
      ...stub,
      owner: 'o',
      repo: 'r',
      pull: pull(1, 'h1'),
    });
    expect(stub.calls.reRunWorkflow).toEqual([12]);
  });
});

describe('the workflow', () => {
  it("looks on a review, an /approve-spec comment, a CI run ending and a quarter-hourly schedule, with main's helper only", () => {
    expect(workflow.on).toMatchObject({
      pull_request_review: {types: ['submitted']},
      issue_comment: {types: ['created']},
      workflow_run: {workflows: ['CI', 'Review signal'], types: ['completed']},
      schedule: [{cron: '11,26,41,56 * * * *'}],
    });
    expect(workflow.permissions).toEqual({});
    const job = workflow.jobs.start;
    expect(job['runs-on']).toBe('ubuntu-slim');
    expect(job.permissions).toEqual({
      actions: 'write',
      contents: 'read',
      'pull-requests': 'read',
      statuses: 'read',
    });
    expect(job.if).toContain(
      "startsWith(github.event.comment.body, '/approve-spec')",
    );
    const checkout = job.steps.find(step =>
      step.uses?.startsWith('actions/checkout'),
    );
    expect(checkout.with).toEqual({
      ref: '${{ github.event.repository.default_branch }}',
      'sparse-checkout': '.github/scripts/lib',
      path: '.heavy-turn',
      'persist-credentials': false,
    });
  });

  /** Runs the workflow's script for an event against a stub GitHub. */
  async function pass(eventName, payload, data) {
    const stub = stubGithub(data);
    const logs = {info: [], warning: []};
    const core = {
      info: m => logs.info.push(m),
      warning: m => logs.warning.push(m),
    };
    const step = workflow.jobs.start.steps.find(s =>
      s.uses?.startsWith('actions/github-script'),
    );
    process.env.HEAVY_MODULE = HEAVY_MODULE;
    process.env.ENG_OWNERS = '@owner1 @owner2';
    process.env.REVIEW_APP = APP;
    const done = new AsyncFunction(
      'github',
      'context',
      'core',
      'importModule',
      step.with.script.replaceAll('await import(', 'await importModule('),
    )(
      stub.github,
      {eventName, repo: {owner: 'o', repo: 'r'}, payload},
      core,
      async specifier => (specifier === 'node:url' ? import('node:url') : turn),
    );
    done.catch(() => {});
    await vi.advanceTimersByTimeAsync(6 * 60_000);
    await done;
    return {calls: stub.calls, logs};
  }

  it('waits for the gate to settle after a review, then starts the deferred run', async () => {
    vi.useFakeTimers();
    let looks = 0;
    const {calls} = await pass(
      'pull_request_review',
      {pull_request: {number: 1}},
      {
        pulls: [pull(1, 'h1')],
        runs: [ciRun(11, 'h1')],
        jobs: {11: deferredJobs},
        // The gate turns success on the third look.
        statuses: {h1: () => ((looks += 1) >= 3 ? passed : pending)},
      },
    );
    vi.useRealTimers();
    expect(calls.reRunWorkflow).toEqual([11]);
  });

  it('starts nothing for a pull request into a release branch', async () => {
    vi.useFakeTimers();
    const {calls, logs} = await pass(
      'workflow_run',
      {workflow_run: {pull_requests: [{number: 1}]}},
      {
        pulls: [pull(1, 'h1', {base: {ref: 'release/v1.2.3'}})],
        runs: [ciRun(11, 'h1')],
        jobs: {11: deferredJobs},
        statuses: {h1: passed},
      },
    );
    vi.useRealTimers();
    expect(calls.reRunWorkflow).toEqual([]);
    expect(logs.info.join('\n')).toContain(
      'not an open pull request into main',
    );
  });

  /** A fork's pull request and its CI run, which lists no pull request. */
  const forkPull = (number, sha) =>
    pull(number, sha, {head: {sha, ref: 'fix', owner: 'someone'}});
  const forkRun = (id, sha, extra = {}) =>
    ciRun(id, sha, {
      pull_requests: [],
      head_branch: 'fix',
      head_repository: {owner: {login: 'someone'}},
      ...extra,
    });

  it("sweeps recent failed runs on the schedule, a fork's and a failed-jobs re-run's included", async () => {
    vi.useFakeTimers();
    const {calls} = await pass(
      'schedule',
      {},
      {
        pulls: [
          pull(1, 'h1'),
          pull(2, 'h2'),
          pull(3, 'h3'),
          forkPull(4, 'h4'),
          pull(5, 'h5'),
        ],
        runs: [
          ciRun(11, 'h1', {pull_requests: [{number: 1}]}),
          ciRun(12, 'h2', {pull_requests: [{number: 2}]}),
          // "Re-run failed jobs" keeps heavy-ci's deferral.
          ciRun(13, 'h3', {pull_requests: [{number: 3}], run_attempt: 2}),
          forkRun(14, 'h4'),
          // A run that ran every suite and failed for another reason.
          ciRun(15, 'h5', {pull_requests: [{number: 5}], run_attempt: 2}),
        ],
        jobs: {
          11: deferredJobs,
          12: deferredJobs,
          13: deferredJobs,
          14: deferredJobs,
          15: ranJobs,
        },
        statuses: {h1: passed, h2: pending, h3: passed, h4: passed, h5: passed},
      },
    );
    vi.useRealTimers();
    expect(calls.reRunWorkflow).toEqual([11, 13, 14]);
  });

  it('starts a fork head admitted after its gates passed, once its deferred run ends', async () => {
    // The gates passed before `ci:run`; admitting the head starts a first
    // attempt that defers, and its end starts the review-pass run.
    vi.useFakeTimers();
    const run = forkRun(15, 'h5');
    const {calls} = await pass(
      'workflow_run',
      {workflow_run: run},
      {
        pulls: [forkPull(5, 'h5')],
        runs: [run],
        jobs: {15: deferredJobs},
        statuses: {h5: passed},
      },
    );
    vi.useRealTimers();
    expect(calls.reRunWorkflow).toEqual([15]);
  });

  it('starts a draft marked ready after its gates passed, once that first run ends', async () => {
    // A draft runs no CI; marking it ready starts a first attempt that defers,
    // and that run's end starts the review-pass run.
    vi.useFakeTimers();
    const run = ciRun(18, 'h7', {pull_requests: [{number: 7}]});
    const {calls} = await pass(
      'workflow_run',
      {workflow_run: run},
      {
        pulls: [pull(7, 'h7')],
        runs: [run],
        jobs: {18: deferredJobs},
        statuses: {h7: passed},
      },
    );
    vi.useRealTimers();
    expect(calls.reRunWorkflow).toEqual([18]);
  });

  it("starts a fork head after a review, on Review signal's end: the review event's own token is read-only for a fork", async () => {
    vi.useFakeTimers();
    let looks = 0;
    const {calls} = await pass(
      'workflow_run',
      {
        workflow_run: {
          name: 'Review signal',
          event: 'pull_request_review',
          pull_requests: [],
          head_branch: 'fix',
          head_sha: 'h9',
          head_repository: {owner: {login: 'someone'}},
        },
      },
      {
        pulls: [forkPull(9, 'h9')],
        runs: [forkRun(19, 'h9')],
        jobs: {19: deferredJobs},
        // Review clear writes the gate after Review signal ends.
        statuses: {h9: () => ((looks += 1) >= 2 ? passed : pending)},
      },
    );
    vi.useRealTimers();
    expect(calls.reRunWorkflow).toEqual([19]);
  });

  it("looks after a CI run and after a review's Review signal run, and no other workflow run", () => {
    const condition = workflow.jobs.start.if;
    expect(condition).toContain(
      "github.event.workflow_run.name == 'CI' && github.event.workflow_run.event == 'pull_request'",
    );
    expect(condition).toContain(
      "github.event.workflow_run.name == 'Review signal' && github.event.workflow_run.event == 'pull_request_review'",
    );
    // For a fork's review the Review signal job is the one with a write
    // token, so a failed API call is retried rather than lost.
    expect(
      workflow.jobs.start.steps.find(step =>
        step.uses?.startsWith('actions/github-script'),
      ).with.retries,
    ).toBe(3);
    // A fork's run lists no pull request, so its head names its group.
    expect(workflow.concurrency.group).toContain(
      "format('{0}-{1}', github.event.workflow_run.head_repository.full_name, github.event.workflow_run.head_branch)",
    );
  });

  it('gives a later head whose gates pass its own review-pass run', async () => {
    vi.useFakeTimers();
    const {calls} = await pass(
      'pull_request_review',
      {pull_request: {number: 6}},
      {
        pulls: [pull(6, 'h6b')],
        // The earlier head already ran again in full.
        runs: [
          ciRun(16, 'h6a', {run_attempt: 2, conclusion: 'success'}),
          ciRun(17, 'h6b', {created_at: '2026-11-17T13:00:00Z'}),
        ],
        jobs: {16: ranJobs, 17: deferredJobs},
        statuses: {h6b: passed},
      },
    );
    vi.useRealTimers();
    expect(calls.reRunWorkflow).toEqual([17]);
  });
});
