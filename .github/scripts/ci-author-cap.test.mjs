// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ci-author-cap.test.mjs
 * @input .github/actions/ci-admission/author-cap.mjs, ci.yml's room job, and
 *   .github/workflows/ci-author-turn.yml run against a stub GitHub
 * @output Proof that one author runs at most three pull-request CI runs at
 *   once, that runs take turns in the order they began, and that a waiting
 *   run starts again when its author's turn comes
 * @position Node coverage for the author cap (spec:AST-030/DEC-31)
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it, vi} from 'vitest';
import yaml from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const AUTHOR_MODULE = path.join(
  root,
  '.github/actions/ci-admission/author-cap.mjs',
);
const cap = await import(AUTHOR_MODULE);
const read = file => yaml.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const ci = read('.github/workflows/ci.yml');
const turnWorkflow = read('.github/workflows/ci-author-turn.yml');
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

const at = minute => new Date(Date.UTC(2026, 10, 17, 12, minute)).toISOString();
const run = (id, minute, extra = {}) => ({
  id,
  created_at: at(minute),
  ...extra,
});

describe('whose turn it is', () => {
  it('lets the first three of five runs that start together go, and the other two wait', () => {
    const runs = [1, 2, 3, 4, 5].map(id => run(id, 0));
    const waits = runs.map(
      self => cap.authorTurn({self, running: runs, waiting: []}).waits,
    );
    expect(waits).toEqual([false, false, false, true, true]);
  });

  it('counts only runs that began before this one', () => {
    const self = run(10, 5);
    const later = [run(11, 6), run(12, 7), run(13, 8)];
    expect(cap.authorTurn({self, running: later, waiting: []})).toEqual({
      waits: false,
      ahead: 0,
      waitingAhead: 0,
    });
  });

  it('keeps a new run behind an older one that still waits, even with room among the running', () => {
    const self = run(20, 30);
    const turn = cap.authorTurn({
      self,
      running: [run(1, 0), run(2, 1)],
      waiting: [run(3, 2)],
    });
    expect(turn).toEqual({waits: true, ahead: 2, waitingAhead: 1});
  });

  it('starts a waiting run again once fewer than three began before it', () => {
    const self = run(3, 2);
    expect(
      cap.authorTurn({self, running: [run(1, 0), run(2, 1), self], waiting: []})
        .waits,
    ).toBe(false);
  });

  it("starts the author's oldest waiting runs, as many as the cap leaves room for", () => {
    const waiting = [run(9, 9), run(7, 7), run(8, 8)];
    expect(
      cap.nextTurns({running: [run(1, 0)], waiting}).map(r => r.id),
    ).toEqual([7, 8]);
    expect(
      cap.nextTurns({running: [run(1, 0), run(2, 1), run(3, 2)], waiting}),
    ).toEqual([]);
  });

  it('exempts only the authors on its one list, which is empty', () => {
    expect(cap.AUTHOR_CAP).toBe(3);
    expect(cap.AUTHOR_CAP_EXEMPT).toEqual([]);
    expect(cap.isExempt('cixzhang')).toBe(false);
    expect(cap.isExempt('Alex', ['alex'])).toBe(true);
    expect(cap.isExempt('blair', ['alex'])).toBe(false);
    expect(cap.isExempt(undefined, ['alex'])).toBe(false);
  });
});

/** A stub GitHub holding open pull requests, CI runs and commit statuses. */
function stubGithub({pulls, runs, statuses = {}}) {
  const calls = {reRunWorkflow: [], listWorkflowRuns: []};
  const github = {
    paginate: async (method, options) => (await method(options)).data,
    rest: {
      pulls: {
        list: async () => ({data: pulls}),
        get: async ({pull_number}) => ({
          data: pulls.find(pull => pull.number === pull_number),
        }),
      },
      actions: {
        listWorkflowRuns: async options => {
          calls.listWorkflowRuns.push(options);
          expect(options).toMatchObject({
            workflow_id: 'ci.yml',
            event: 'pull_request',
            per_page: 100,
          });
          return {
            data: {
              workflow_runs: runs.filter(r =>
                options.status === 'cancelled'
                  ? r.conclusion === 'cancelled'
                  : r.status === options.status,
              ),
            },
          };
        },
        reRunWorkflow: async ({run_id}) => {
          calls.reRunWorkflow.push(run_id);
        },
      },
      repos: {
        listCommitStatusesForRef: async ({ref}) => ({
          data: statuses[ref] ?? [],
        }),
      },
    },
  };
  return {github, calls};
}

const pull = (number, login, sha, fork = false) => ({
  number,
  user: {login},
  head: {sha, repo: {full_name: fork ? `${login}/r` : 'o/r'}},
});
const ciRun = (id, minute, sha, number, state) => ({
  ...run(id, minute),
  head_sha: sha,
  pull_requests: number == null ? [] : [{number}],
  ...(state === 'cancelled'
    ? {status: 'completed', conclusion: 'cancelled'}
    : {status: state, conclusion: null}),
});
const pending = [{context: 'CI author cap', state: 'pending'}];

describe("reading each author's runs", () => {
  it('counts by pull-request author, every author alike, leaves forks out, and finds the runs that wait', async () => {
    const {github} = stubGithub({
      pulls: [
        pull(1, 'alex', 'a1'),
        pull(2, 'alex', 'a2'),
        pull(3, 'alex', 'a3'),
        pull(4, 'cixzhang', 'c4'),
        pull(5, 'fork-author', 'f5', true),
        pull(6, 'alex', 'a6'),
      ],
      runs: [
        // A run someone else started on alex's pull request still counts
        // for alex.
        {...ciRun(101, 0, 'a1', 1, 'in_progress'), actor: {login: 'someone'}},
        ciRun(102, 1, 'a2', 2, 'queued'),
        ciRun(104, 2, 'c4', 4, 'in_progress'),
        ciRun(105, 3, 'f5', null, 'in_progress'),
        // Waiting: cancelled at the current head, and its status is pending.
        ciRun(103, 4, 'a3', 3, 'cancelled'),
        // Cancelled at an older head of #6: not waiting.
        ciRun(106, 5, 'old6', 6, 'cancelled'),
      ],
      statuses: {a3: pending, old6: pending},
    });
    const authors = await cap.readAuthors({github, owner: 'o', repo: 'r'});
    // Every author counts, the agent lanes' shared one too.
    expect([...authors.keys()].sort()).toEqual(['alex', 'cixzhang']);
    expect(authors.get('cixzhang').running.map(r => r.id)).toEqual([104]);
    const alex = authors.get('alex');
    expect(alex.running.map(r => r.id)).toEqual([101, 102]);
    expect(alex.waiting.map(r => r.id)).toEqual([103]);
  });

  it('does not count a cancelled run whose newest author-cap status is not pending', async () => {
    const {github} = stubGithub({
      pulls: [pull(1, 'alex', 'a1')],
      runs: [ciRun(101, 0, 'a1', 1, 'cancelled')],
      statuses: {
        a1: [
          {context: 'CI author cap', state: 'success'},
          {context: 'CI author cap', state: 'pending'},
        ],
      },
    });
    const authors = await cap.readAuthors({github, owner: 'o', repo: 'r'});
    expect(authors.get('alex')).toBeUndefined();
  });
});

describe("ci.yml's author-cap step", () => {
  const job = ci.jobs['superseded-runs'];
  const step = job.steps.find(s => s.name === "Wait for the author's turn");

  it('runs in the one job that may cancel runs, after the sweep, for pull requests from this repository only', () => {
    expect(job.permissions).toMatchObject({
      actions: 'write',
      statuses: 'write',
    });
    expect(job.steps[0].with['sparse-checkout']).toContain(
      '.github/actions/ci-admission',
    );
    const names = job.steps.map(s => s.name);
    expect(names.indexOf("Wait for the author's turn")).toBeGreaterThan(
      names.indexOf('Cancel runs for a superseded head'),
    );
    expect(job.if).toContain(
      'github.event.pull_request.head.repo.full_name == github.repository',
    );
  });

  /** Runs the step's script for alex's #9 (run 900, begun at minute 50). */
  async function check({
    runs,
    statuses = {},
    author = 'alex',
    labels = [],
    trusted = false,
    broken = false,
    statusFails = false,
  }) {
    const pulls = [1, 2, 3, 4, 9].map(n => pull(n, author, `h${n}`));
    const {github} = stubGithub({pulls: broken ? null : pulls, runs, statuses});
    const writes = {statuses: [], cancels: []};
    github.rest.repos.createCommitStatus = async status => {
      if (statusFails) throw new Error('the status could not be written');
      writes.statuses.push(status);
    };
    github.rest.actions.cancelWorkflowRun = async ({run_id}) => {
      writes.cancels.push(run_id);
    };
    github.rest.actions.getWorkflowRun = async ({run_id}) => ({
      data: runs.find(r => r.id === run_id),
    });
    const logs = {info: [], warning: [], notice: []};
    const core = {
      info: m => logs.info.push(m),
      warning: m => logs.warning.push(m),
      notice: m => logs.notice.push(m),
    };
    process.env.AUTHOR_MODULE = AUTHOR_MODULE;
    process.env.RUN_LABELS_MODULE = 'run-labels';
    await new AsyncFunction(
      'github',
      'context',
      'core',
      'importModule',
      step.with.script.replaceAll('await import(', 'await importModule('),
    )(
      github,
      {
        repo: {owner: 'o', repo: 'r'},
        runId: 900,
        payload: {
          pull_request: {
            number: 9,
            user: {login: author},
            head: {sha: 'h9', repo: {full_name: 'o/r'}},
            labels: labels.map(name => ({name})),
          },
        },
      },
      core,
      async specifier => {
        if (specifier === 'node:url') return import('node:url');
        if (specifier.includes('run-labels'))
          return {decideRunLabel: async () => trusted};
        return cap;
      },
    );
    return {writes, logs};
  }
  const own = ciRun(900, 50, 'h9', 9, 'in_progress');

  it("marks its head and cancels itself when three of the author's runs began first", async () => {
    const {writes, logs} = await check({
      runs: [
        ciRun(101, 10, 'h1', 1, 'in_progress'),
        ciRun(102, 20, 'h2', 2, 'in_progress'),
        ciRun(103, 30, 'h3', 3, 'queued'),
        own,
      ],
    });
    expect(writes.statuses).toEqual([
      expect.objectContaining({
        sha: 'h9',
        context: 'CI author cap',
        state: 'pending',
      }),
    ]);
    expect(writes.statuses[0].description.length).toBeLessThanOrEqual(140);
    expect(writes.cancels).toEqual([900]);
    expect(logs.notice.join('\n')).toContain('Author cap');
  });

  it('waits behind an older run of the author that still waits, with two running', async () => {
    const {writes} = await check({
      runs: [
        ciRun(101, 10, 'h1', 1, 'in_progress'),
        ciRun(102, 20, 'h2', 2, 'in_progress'),
        ciRun(104, 40, 'h4', 4, 'cancelled'),
        own,
      ],
      statuses: {h4: pending},
    });
    expect(writes.cancels).toEqual([900]);
  });

  it('goes on when fewer than three began first, and marks a head that waited before as started', async () => {
    const {writes} = await check({
      runs: [
        ciRun(101, 10, 'h1', 1, 'in_progress'),
        ciRun(102, 20, 'h2', 2, 'in_progress'),
        own,
        // Began after this run: it does not count.
        ciRun(103, 55, 'h3', 3, 'in_progress'),
      ],
      statuses: {h9: pending},
    });
    expect(writes.cancels).toEqual([]);
    expect(writes.statuses).toEqual([
      expect.objectContaining({sha: 'h9', state: 'success'}),
    ]);
  });

  it('does not count a trusted release-critical run, and lets the run go on when the count fails', async () => {
    const crowded = [
      ciRun(101, 10, 'h1', 1, 'in_progress'),
      ciRun(102, 20, 'h2', 2, 'in_progress'),
      ciRun(103, 30, 'h3', 3, 'in_progress'),
      own,
    ];
    const cases = [
      {runs: crowded, labels: ['release-critical'], trusted: true},
      {runs: crowded, broken: true},
    ];
    for (const options of cases) {
      const {writes, logs} = await check(options);
      expect(writes.cancels).toEqual([]);
      expect(writes.statuses).toEqual([]);
      if (options.broken)
        expect(logs.warning.join('\n')).toMatch(
          /^author cap not evaluated: could not count alex's pull-request runs/,
        );
    }
    // Any other failure, here the status write, is a loud skip too.
    const failing = await check({runs: crowded, statusFails: true});
    expect(failing.writes.cancels).toEqual([]);
    expect(failing.logs.warning.join('\n')).toContain(
      'author cap not evaluated: the status could not be written',
    );
    // A release-critical label from someone without write access counts
    // as no label.
    const untrusted = await check({
      runs: crowded,
      labels: ['release-critical'],
    });
    expect(untrusted.writes.cancels).toEqual([900]);
  });
});

describe('the workflow that starts a waiting run again', () => {
  it('runs on the end of a CI run and on a quarter-hourly schedule, and checks out no pull-request code', () => {
    const on = turnWorkflow.on;
    expect(on.workflow_run).toEqual({workflows: ['CI'], types: ['completed']});
    expect(on.schedule).toEqual([{cron: '4,19,34,49 * * * *'}]);
    expect(turnWorkflow.permissions).toEqual({});
    const job = turnWorkflow.jobs.turn;
    expect(job['runs-on']).toBe('ubuntu-slim');
    expect(job.permissions).toEqual({
      actions: 'write',
      contents: 'read',
      'pull-requests': 'read',
      statuses: 'read',
    });
    const checkout = job.steps.find(step =>
      step.uses?.startsWith('actions/checkout'),
    );
    expect(checkout.with).toEqual({
      'sparse-checkout': '.github/actions/ci-admission',
      path: '.author-cap',
      'persist-credentials': false,
    });
    expect(checkout.with.ref).toBeUndefined();
  });

  /** Runs the workflow's script against a stub GitHub. */
  async function pass({payload, ...data}) {
    const {github, calls} = stubGithub(data);
    const logs = {info: [], warning: []};
    const core = {
      info: message => logs.info.push(message),
      warning: message => logs.warning.push(message),
    };
    const step = turnWorkflow.jobs.turn.steps.find(s =>
      s.uses?.startsWith('actions/github-script'),
    );
    process.env.AUTHOR_MODULE = AUTHOR_MODULE;
    await new AsyncFunction(
      'github',
      'context',
      'core',
      'importModule',
      step.with.script.replaceAll('await import(', 'await importModule('),
    )(
      github,
      {repo: {owner: 'o', repo: 'r'}, payload},
      core,
      async specifier => (specifier === 'node:url' ? import('node:url') : cap),
    );
    return {calls, logs};
  }

  it("starts the ended run's author's oldest waiting run when that leaves room", async () => {
    const {calls} = await pass({
      payload: {workflow_run: {pull_requests: [{number: 1}]}},
      pulls: [
        pull(1, 'alex', 'a1'),
        pull(2, 'alex', 'a2'),
        pull(3, 'alex', 'a3'),
        pull(4, 'alex', 'a4'),
        pull(5, 'alex', 'a5'),
      ],
      runs: [
        ciRun(102, 1, 'a2', 2, 'in_progress'),
        ciRun(103, 2, 'a3', 3, 'in_progress'),
        ciRun(105, 4, 'a5', 5, 'cancelled'),
        ciRun(104, 3, 'a4', 4, 'cancelled'),
      ],
      statuses: {a4: pending, a5: pending},
    });
    expect(calls.reRunWorkflow).toEqual([104]);
  });

  it('starts nothing while the author still runs three', async () => {
    const {calls} = await pass({
      payload: {},
      pulls: [
        pull(1, 'alex', 'a1'),
        pull(2, 'alex', 'a2'),
        pull(3, 'alex', 'a3'),
        pull(4, 'alex', 'a4'),
      ],
      runs: [
        ciRun(101, 0, 'a1', 1, 'in_progress'),
        ciRun(102, 1, 'a2', 2, 'in_progress'),
        ciRun(103, 2, 'a3', 3, 'queued'),
        ciRun(104, 3, 'a4', 4, 'cancelled'),
      ],
      statuses: {a4: pending},
    });
    expect(calls.reRunWorkflow).toEqual([]);
  });

  it("ends on one call for a fork's run, whose token cannot start runs", async () => {
    const {calls, logs} = await pass({
      payload: {workflow_run: {pull_requests: [{number: 5}]}},
      pulls: [pull(5, 'fork-author', 'f5', true)],
      runs: [],
    });
    expect(calls.listWorkflowRuns).toEqual([]);
    expect(calls.reRunWorkflow).toEqual([]);
    expect(logs.info.join('\n')).toContain('does not count');
  });

  it('leaves the schedule to serve every author', async () => {
    vi.useRealTimers();
    const {calls} = await pass({
      payload: {},
      pulls: [pull(1, 'alex', 'a1'), pull(2, 'blair', 'b2')],
      runs: [
        ciRun(101, 0, 'a1', 1, 'cancelled'),
        ciRun(102, 1, 'b2', 2, 'cancelled'),
      ],
      statuses: {a1: pending, b2: pending},
    });
    expect(calls.reRunWorkflow.sort()).toEqual([101, 102]);
  });
});
