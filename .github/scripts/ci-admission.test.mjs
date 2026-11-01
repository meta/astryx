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
  const pr = (id, extra = {}) => ({
    id,
    status: 'in_progress',
    event: 'pull_request',
    path: '.github/workflows/ci.yml',
    ...extra,
  });
  const slim = id => ({
    id,
    status: 'in_progress',
    event: 'workflow_run',
    path: '.github/workflows/pr-comment.yml',
  });
  const mainCheck = (id, admitting) => ({
    id,
    status: 'in_progress',
    event: 'workflow_dispatch',
    path: '.github/workflows/ci.yml',
    jobs: [
      {
        status: 'in_progress',
        steps: [{name: STEP, status: admitting ? 'in_progress' : 'completed'}],
      },
    ],
  });

  async function admit({
    active = [],
    peak = 12,
    isMain = false,
    labels = [],
    pull = {},
    error,
    maxWait = 15,
  } = {}) {
    vi.useFakeTimers();
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
            };
          },
          listJobsForWorkflowRun: async ({run_id}) => {
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

  it('starts at once with room, for two API calls, not counting its own run', async () => {
    // 5 pull-request runs (60) + room kept for small workflows (18) + 12 = 90.
    const result = await admit({
      active: [pr(OWN), ...[2, 3, 4, 5, 6].map(id => pr(id))],
    });
    expect(result).toMatchObject({looks: 1, calls: 2, warning: []});
  });

  it('estimates each run by its workflow, keeping room for small workflows', async () => {
    const prs = count => Array.from({length: count}, (_, i) => pr(10 + i));
    const slims = count => Array.from({length: count}, (_, i) => slim(100 + i));
    // Small workflows always count at least their measured most, 18.
    expect((await admit({active: [...prs(5), ...slims(18)]})).looks).toBe(1);
    expect(
      (await admit({active: [...prs(5), ...slims(19)]})).looks,
    ).toBeGreaterThan(1);
    // Six pull-request runs leave no room once that share is kept.
    expect((await admit({active: prs(6)})).looks).toBeGreaterThan(1);
    // A running Main unit run counts its planned most.
    const unit = {
      id: 40,
      status: 'in_progress',
      event: 'push',
      path: '.github/workflows/deploy.yml',
    };
    expect((await admit({active: [...prs(3), unit]})).looks).toBe(1);
    expect((await admit({active: [...prs(4), unit]})).looks).toBeGreaterThan(1);
  });

  it('waits until others finish, looking every two minutes, and gives up after fifteen', async () => {
    const full = Array.from({length: 6}, (_, i) => pr(10 + i)); // 72 + 18 + 12 > 90
    const freed = await admit({
      active: look => (look < 3 ? full : full.slice(1)),
    });
    expect(freed.looks).toBe(3);
    const stuck = await admit({active: full});
    expect(stuck.looks).toBe(8);
    expect(stuck.warning[0]).toContain('after 15 minutes');
    // A pull request gives up after twelve.
    const pull = await admit({active: full, maxWait: 12});
    expect(pull.looks).toBe(7);
  });

  it("adds the jobs a pull request's opt-in labels bring", async () => {
    // 4 pull-request runs (48) and 25 slim jobs: 73 + 12 fits; + 6 for the label does not.
    const active = [
      ...Array.from({length: 4}, (_, i) => pr(10 + i)),
      ...Array.from({length: 25}, (_, i) => slim(20 + i)),
    ];
    expect((await admit({active})).looks).toBe(1);
    expect(
      (await admit({active, labels: ['ci:run-visual']})).looks,
    ).toBeGreaterThan(1);
  });

  it('lets a waiting main check go first; never waits for another pull request', async () => {
    const held = await admit({active: look => [mainCheck(50, look < 2)]});
    expect(held.looks).toBe(2);
    // Another pull-request run waiting for room does not hold this one.
    const peers = await admit({
      active: [{...pr(60), jobs: mainCheck(0, true).jobs}],
    });
    expect(peers).toMatchObject({looks: 1, calls: 2});
    // A main check does not wait for another main check's wait.
    const mainRun = await admit({
      isMain: true,
      peak: 36,
      active: [mainCheck(50, true)],
    });
    expect(mainRun).toMatchObject({looks: 1, calls: 2});
  });

  it('starts at once, with no API calls, for a pull request that runs no CI yet', async () => {
    const full = Array.from({length: 8}, (_, i) => pr(10 + i));
    for (const pull of [{draft: true}, {head: {repo: {full_name: 'fork/r'}}}]) {
      expect(await admit({active: full, pull})).toMatchObject({
        looks: 0,
        calls: 0,
      });
    }
    // A labelled fork runs CI, so it waits like any other run.
    const labelled = await admit({
      active: full,
      labels: ['ci:run'],
      pull: {head: {repo: {full_name: 'fork/r'}}},
    });
    expect(labelled.looks).toBeGreaterThan(1);
  });

  it('starts when the API cannot be read, rate limit included', async () => {
    const result = await admit({error: new Error('API rate limit exceeded')});
    expect(result.warning[0]).toContain('could not be checked');
  });

  it('refuses a peak that is not a positive integer', async () => {
    await expect(admit({peak: 0})).rejects.toThrow('positive integer');
  });
});
