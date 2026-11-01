// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every CI and Main run waits for room under CI's ceiling before its
 *   jobs start (.github/actions/ci-admission, spec:AST-030 FR16, DEC-16).
 * @input The action, the CI and Main workflows, and a stubbed GitHub API
 * @output Where each run waits, that waiting can never skip or fail a required
 *   check, each run's `peak` against the jobs it can hold, and when a run
 *   starts, yields to `main`, or gives up waiting
 * @position Node contracts for the run-level ceiling; heavy-caps-action.test.mjs
 *   keeps the per-author limits
 */

import fs from 'node:fs';
import path from 'node:path';

import {afterEach, describe, expect, it, vi} from 'vitest';
import yaml from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const read = file => yaml.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const action = read('.github/actions/ci-admission/action.yml');
const ci = read('.github/workflows/ci.yml');
const main = read('.github/workflows/deploy.yml');
const script = action.runs.steps[0].with.script;
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const STEP = 'Wait for room under the CI ceiling';
const CEILING = Number(/const CI_CEILING = (\d+);/.exec(script)[1]);
const needsOf = job => [job.needs ?? []].flat();
const stepOf = job => job.steps.find(step => step.name === STEP);
const estimateOf = workflow =>
  new RegExp(`'\\.github/workflows/${workflow}': [^\\n]*`).exec(script)[0];

/** Legs a job runs for an event: its matrix size, or one. */
function legs(job, event = 'workflow_dispatch') {
  const matrix = job.strategy?.matrix;
  if (matrix == null) return 1;
  return Object.values(matrix)
    .map(value => {
      if (Array.isArray(value)) return value;
      // A release-check's wider legs (spec:AST-030): one branch per event.
      const split =
        /fromJSON\(github\.event_name == 'workflow_dispatch' && '([^']*)' \|\| '([^']*)'\)/.exec(
          String(value),
        );
      if (!split) return [value];
      return JSON.parse(event === 'workflow_dispatch' ? split[1] : split[2]);
    })
    .reduce((product, list) => product * list.length, 1);
}

describe('where runs wait', () => {
  const admission = ci.jobs.admission;
  const wait = stepOf(admission);

  it('admits a whole ci.yml run in a first slim job that every other job needs', () => {
    expect(Object.keys(ci.jobs)[0]).toBe('admission');
    expect(admission['runs-on']).toBe('ubuntu-slim');
    expect(admission.permissions).toEqual({actions: 'read', contents: 'read'});
    expect(wait.uses).toBe('./.ci-admission/.github/actions/ci-admission');
    // Directly, or through the jobs it needs.
    const reaches = id =>
      needsOf(ci.jobs[id]).some(need => need === 'admission' || reaches(need));
    for (const id of Object.keys(ci.jobs)) {
      if (id !== 'admission') expect(reaches(id), id).toBe(true);
    }
  });

  it('can never skip or fail, so every job and required check decides as before', () => {
    // No condition: it runs for every event, drafts and forks included, and
    // the action returns at once for a pull request that may not run CI.
    expect(admission.if).toBeUndefined();
    expect(needsOf(admission)).toEqual([]);
    // Whatever the step does, a lookup error or its own time limit, the job
    // succeeds, and it finishes before the job's own limit.
    expect(wait['continue-on-error']).toBe(true);
    const limit = (value, event) => {
      const split = /&& (\d+) \|\| (\d+)/.exec(String(value));
      return split
        ? Number(split[event === 'workflow_dispatch' ? 1 : 2])
        : Number(value);
    };
    for (const event of ['workflow_dispatch', 'pull_request']) {
      // The wait ends before the step's limit, and the step's before the job's.
      expect(limit(wait.with['max-wait-minutes'], event)).toBeLessThan(
        limit(wait['timeout-minutes'], event),
      );
      expect(limit(wait['timeout-minutes'], event)).toBeLessThan(
        limit(admission['timeout-minutes'], event),
      );
    }
    // A pull request's admission stays inside the fifteen-minute job budget.
    expect(
      limit(admission['timeout-minutes'], 'pull_request'),
    ).toBeLessThanOrEqual(15);
    expect(limit(wait.with['max-wait-minutes'], 'workflow_dispatch')).toBe(15);
    // A pull request looks twice; the rare main run every two minutes.
    expect(limit(wait.with['max-looks'], 'pull_request')).toBe(2);
    expect(limit(wait.with['max-looks'], 'workflow_dispatch')).toBe(8);
    expect(admission.steps.filter(step => step !== wait)).toEqual([
      expect.objectContaining({uses: 'actions/checkout@v7'}),
    ]);
  });

  it('leaves every required context reporting on drafts, forks, deferred pushes and spec-only pull requests', () => {
    // build, test and docsite-test, and the build-storybook and typecheck
    // results build reads, each state a status rule and never read admission's
    // result, so admission can change none of their verdicts short of a
    // cancelled run. Admission itself returns at once for a draft or an
    // unlabelled fork (below), and admits every other pull request, a
    // deferred push or a spec-only change included, like any run.
    for (const id of [
      'build',
      'test',
      'docsite-test',
      'build-storybook',
      'typecheck',
    ]) {
      const condition = String(ci.jobs[id].if);
      expect(condition, id).toMatch(/\b(always|cancelled)\(\)/);
      expect(condition, id).not.toContain('needs.admission');
    }
    // lint and review-required are written by workflows admission does not touch.
    for (const file of ['lint.yml', 'review-signal.yml', 'review-clear.yml']) {
      expect(
        fs.readFileSync(path.join(root, '.github/workflows', file), 'utf8'),
      ).not.toContain('ci-admission');
    }
  });

  it("admits Main's unit run in main-commit, which every other job needs", () => {
    const job = main.jobs['main-commit'];
    const step = stepOf(job);
    expect(step.uses).toBe('./.ci-admission/.github/actions/ci-admission');
    expect(step.with.main).toBe(true);
    expect(step.with['max-wait-minutes']).toBeUndefined(); // fifteen
    expect(step['continue-on-error']).toBe(true);
    expect(job.permissions.actions).toBe('read');
    // Directly, or through the lanes it joins.
    const reaches = id =>
      needsOf(main.jobs[id]).some(
        need => need === 'main-commit' || reaches(need),
      );
    for (const id of Object.keys(main.jobs)) {
      if (id !== 'main-commit') expect(reaches(id), id).toBe(true);
    }
  });
});

describe('peaks', () => {
  it('gives a release-check a peak that covers every job it can hold at once', () => {
    // A release-check runs the jobs its join needs. A job every leg needs
    // has finished before the legs start, and each join needs legs that have
    // finished, so the most held at once is every leg plus the other first
    // jobs.
    const closure = new Set();
    const visit = name => {
      for (const need of needsOf(ci.jobs[name])) {
        if (
          ['maintenance-request', 'admission'].includes(need) ||
          closure.has(need)
        )
          continue;
        closure.add(need);
        visit(need);
      }
    };
    visit('release-check');
    const inner = name =>
      needsOf(ci.jobs[name]).filter(need => closure.has(need));
    const first = [...closure].filter(name => inner(name).length === 0);
    const wave = [...closure].filter(
      name =>
        inner(name).length > 0 &&
        inner(name).every(need => first.includes(need)),
    );
    const before = first.filter(name =>
      wave.every(job => inner(job).includes(name)),
    );
    expect(before).toContain('build-storybook');
    const held = [...wave, ...first.filter(name => !before.includes(name))]
      .map(name => legs(ci.jobs[name]))
      .reduce((sum, count) => sum + count, 0);
    const peak = Number(
      /&& (\d+) \|\|/.exec(stepOf(ci.jobs.admission).with.peak)[1],
    );
    expect(peak).toBeGreaterThanOrEqual(held);
    expect(peak).toBeLessThanOrEqual(CEILING);
    // Other runs count a running release-check at the same peak.
    expect(estimateOf('ci.yml')).toContain(`'workflow_dispatch' ? ${peak} :`);
  });

  it("gives Main's unit run a peak that covers all its jobs beside main-commit", () => {
    const held = Object.keys(main.jobs)
      .filter(name => name !== 'main-commit' && name !== 'test')
      .map(name => legs(main.jobs[name]))
      .reduce((sum, count) => sum + count, 0);
    const peak = stepOf(main.jobs['main-commit']).with.peak;
    expect(peak).toBeGreaterThanOrEqual(held);
    expect(estimateOf('deploy.yml')).toContain(`() => ${peak},`);
  });

  it('adds the jobs each opt-in label brings to a pull request', () => {
    const pull = job => legs(ci.jobs[job], 'pull_request');
    expect(JSON.parse(stepOf(ci.jobs.admission).with['label-legs'])).toEqual({
      'ci:run-visual': pull('visual-scout') + pull('pr-visual'),
      'ci:run-rtl':
        pull('pr-rtl-shard') + pull('pr-rtl-merge') + pull('pr-rtl'),
      'ci:run-a11y':
        pull('pr-a11y-guards') + pull('pr-a11y-specs') + pull('pr-a11y'),
    });
  });
});

describe('ci admission', () => {
  afterEach(() => vi.useRealTimers());
  afterEach(() => vi.restoreAllMocks());
  const OWN = 1;
  const NOW = Date.parse('2026-11-01T02:00:00Z');
  const ago = minutes => new Date(NOW - minutes * 60_000).toISOString();
  const busy = count =>
    Array.from({length: count}, () => ({status: 'in_progress', steps: []}));
  /** A CI or Main run admitted `admittedMinutesAgo` ago with `live` jobs running. */
  const admittedRun = (
    id,
    live,
    {
      event = 'pull_request',
      path = '.github/workflows/ci.yml',
      admittedMinutesAgo = 10,
    } = {},
  ) => ({
    id,
    status: 'in_progress',
    event,
    path,
    jobs: [
      {
        status: 'completed',
        steps: [
          {
            name: STEP,
            status: 'completed',
            completed_at: ago(admittedMinutesAgo),
          },
        ],
      },
      ...busy(live),
    ],
  });
  /** A CI or Main run still waiting in its admission step. */
  const waitingRun = (
    id,
    {event = 'pull_request', path = '.github/workflows/ci.yml'} = {},
  ) => ({
    id,
    status: 'in_progress',
    event,
    path,
    jobs: [
      {status: 'in_progress', steps: [{name: STEP, status: 'in_progress'}]},
    ],
  });
  const slim = id => ({
    id,
    status: 'in_progress',
    event: 'workflow_run',
    path: '.github/workflows/pr-comment.yml',
  });
  const prs = (count, live = 12) =>
    Array.from({length: count}, (_, i) => admittedRun(10 + i, live));
  const slims = count => Array.from({length: count}, (_, i) => slim(500 + i));

  async function admit({
    active = [],
    peak = 12,
    isMain = false,
    labels = [],
    pull = {},
    error,
    maxWait = 15,
    maxLooks = 8,
    budget = 4000,
  } = {}) {
    vi.useFakeTimers({now: NOW});
    vi.spyOn(Math, 'random').mockReturnValue(0);
    let looks = 0;
    let calls = 0;
    const logs = {info: [], warning: []};
    const runs = () => (typeof active === 'function' ? active(looks) : active);
    const github = {
      rest: {
        actions: {
          listWorkflowRunsForRepo: async ({status, event, per_page}) => {
            if (error) throw error;
            expect([event, per_page]).toEqual([undefined, 100]);
            calls += 1;
            if (status === 'in_progress') looks += 1;
            return {
              data: {
                workflow_runs: runs().filter(run => run.status === status),
              },
              headers: {'x-ratelimit-remaining': String(budget)},
            };
          },
          listJobsForWorkflowRun: async ({run_id, per_page}) => {
            expect(per_page).toBe(100);
            calls += 1;
            return {
              data: {jobs: runs().find(run => run.id === run_id).jobs ?? []},
            };
          },
        },
      },
    };
    const core = {
      info: message => logs.info.push(message),
      warning: message => logs.warning.push(message),
    };
    const context = {
      repo: {owner: 'o', repo: 'r'},
      runId: OWN,
      payload: isMain
        ? {}
        : {
            pull_request: {
              draft: false,
              head: {repo: {full_name: 'o/r'}},
              labels: labels.map(name => ({name})),
              ...pull,
            },
          },
    };
    Object.assign(process.env, {
      PEAK: String(peak),
      MAIN: String(isMain),
      LABEL_LEGS: '{"ci:run-visual": 6}',
      MAX_WAIT_MINUTES: String(maxWait),
      MAX_LOOKS: String(maxLooks),
    });
    const done = new AsyncFunction('github', 'context', 'core', script)(
      github,
      context,
      core,
    );
    // Observed here; `await done` below still rethrows a failure.
    done.catch(() => {});
    await vi.advanceTimersByTimeAsync(20 * 60_000);
    await done;
    return {...logs, looks, calls};
  }

  it("admits at once at today's load: 56 live jobs and many pull-request runs waiting", async () => {
    // 2026-11-01 ~01:50Z: 56 jobs ran while about a dozen pull-request runs
    // waited here. The first estimate counted each waiting run at 12 and saw
    // about 180 jobs, so every run waited out its twelve minutes.
    const active = [
      ...prs(4, 11),
      admittedRun(30, 12, {
        event: 'push',
        path: '.github/workflows/deploy.yml',
      }),
      ...Array.from({length: 12}, (_, i) => waitingRun(40 + i)),
      ...slims(8),
    ];
    const result = await admit({active, maxWait: 12, maxLooks: 2});
    expect(result.looks).toBe(1);
    expect(result.warning).toEqual([]);
    // Two run listings plus one jobs call per CI or Main run.
    expect(result.calls).toBe(2 + 4 + 1 + 12);
  });

  it('counts live jobs, and a run admitted in the last three minutes at least at its most', async () => {
    // 4 x 12 live + 18 small + 13 = 79: room.
    expect((await admit({active: prs(4), peak: 13})).looks).toBe(1);
    // A just-admitted run with 2 jobs so far counts 12 (91); a long-running one, 2 (81).
    const fresh = admittedRun(60, 2, {admittedMinutesAgo: 1});
    const old = admittedRun(60, 2, {admittedMinutesAgo: 9});
    expect(
      (await admit({active: [...prs(4), fresh], peak: 13})).looks,
    ).toBeGreaterThan(1);
    expect((await admit({active: [...prs(4), old], peak: 13})).looks).toBe(1);
  });

  it("keeps room for small workflows' measured most", async () => {
    expect((await admit({active: [...prs(5), ...slims(18)]})).looks).toBe(1);
    expect(
      (await admit({active: [...prs(5), ...slims(19)]})).looks,
    ).toBeGreaterThan(1);
  });

  it('looks twice for a pull request, at once and after its longest wait', async () => {
    const full = prs(6); // 72 + 18 + 12 > 90
    const pull = await admit({active: full, maxWait: 12, maxLooks: 2});
    expect(pull.looks).toBe(2);
    expect(pull.warning[0]).toContain('after 12 minutes');
    const freed = await admit({
      active: look => (look < 2 ? full : full.slice(1)),
      maxWait: 12,
      maxLooks: 2,
    });
    expect(freed).toMatchObject({looks: 2, warning: []});
  });

  it('looks every two minutes for a main run, for at most fifteen', async () => {
    const full = prs(5); // 60 + 18 + 36 > 90
    const stuck = await admit({active: full, isMain: true, peak: 36});
    expect(stuck.looks).toBe(8);
    expect(stuck.warning[0]).toContain('after 15 minutes');
    const freed = await admit({
      active: look => (look < 3 ? full : full.slice(3)),
      isMain: true,
      peak: 36,
    });
    expect(freed.looks).toBe(3);
  });

  it('lets a waiting main run go first, counting its whole peak; never waits for a pull-request run', async () => {
    const mainWaiting = waitingRun(70, {event: 'workflow_dispatch'});
    const held = await admit({
      active: look =>
        look < 2
          ? [mainWaiting]
          : [admittedRun(70, 30, {event: 'workflow_dispatch'})],
      maxWait: 12,
      maxLooks: 2,
    });
    expect(held.looks).toBe(2);
    // Other pull-request runs waiting for room hold nothing.
    expect(
      (await admit({active: [waitingRun(71), waitingRun(72)]})).looks,
    ).toBe(1);
    // A main run does not wait for another main run's wait, but counts its peak.
    expect(
      (
        await admit({
          isMain: true,
          peak: 36,
          active: [
            waitingRun(73, {
              event: 'schedule',
              path: '.github/workflows/deploy.yml',
            }),
          ],
        })
      ).looks,
    ).toBe(1);
  });

  it("adds the jobs a pull request's opt-in labels bring", async () => {
    // 4 runs x 12 + 25 slim jobs: 73 + 12 fits; + 6 for the label does not.
    const active = [...prs(4), ...slims(25)];
    expect((await admit({active})).looks).toBe(1);
    expect(
      (await admit({active, labels: ['ci:run-visual']})).looks,
    ).toBeGreaterThan(1);
  });

  it('starts at once, with no API calls, for a pull request that runs no CI yet', async () => {
    const full = prs(8);
    for (const pull of [{draft: true}, {head: {repo: {full_name: 'fork/r'}}}]) {
      expect(await admit({active: full, pull})).toMatchObject({
        looks: 0,
        calls: 0,
      });
    }
    const labelled = await admit({
      active: full,
      labels: ['ci:run'],
      pull: {head: {repo: {full_name: 'fork/r'}}},
    });
    expect(labelled.looks).toBeGreaterThan(1);
  });

  it('starts rather than spend a low API budget, and when the API cannot be read', async () => {
    const low = await admit({active: prs(8), budget: 1499});
    expect(low).toMatchObject({looks: 1, calls: 1});
    expect(low.warning[0]).toContain('API calls left');
    const failed = await admit({error: new Error('API rate limit exceeded')});
    expect(failed.warning[0]).toContain('could not be checked');
  });

  it('refuses a peak that is not a positive integer', async () => {
    await expect(admit({peak: 0})).rejects.toThrow('positive integer');
  });
});
