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
import {matrixFor} from './ci-matrix.mjs';
import {PR_CI_GATE} from './ci-pr-gate.mjs';

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
    .map(value => matrixFor(value, event))
    .reduce((product, list) => product * list.length, 1);
}

describe('where runs wait', () => {
  const admission = ci.jobs.admission;
  const wait = stepOf(admission);

  it('waits in two slim jobs: room for the Storybook build, then the rest of the run', () => {
    const room = ci.jobs.room;
    expect(Object.keys(ci.jobs).slice(0, 2)).toEqual(['room', 'admission']);
    for (const job of [room, admission]) {
      expect(job['runs-on']).toBe('ubuntu-slim');
      expect(stepOf(job).uses).toBe(
        './.ci-admission/.github/actions/ci-admission',
      );
    }
    expect(stepOf(room).with.phase).toBe('room');
    expect(stepOf(room).id).toBe('room');
    expect(wait.with.phase).toBe('rest');
    expect(needsOf(admission)).toEqual(['room']);
    expect(room.permissions).toEqual({actions: 'read', contents: 'read'});
    // The rest of the wait carries on from where room left off.
    for (const key of ['fits', 'started', 'looks', 'next'])
      expect(wait.with[key]).toBe(`\${{ needs.room.outputs.${key} }}`);
    for (const key of ['fits', 'full', 'started', 'looks', 'next'])
      expect(room.outputs[key]).toBe(`\${{ steps.room.outputs.${key} }}`);
    // Every job but the Storybook build reaches admission, directly or through
    // the jobs it needs, never only through the build.
    const BESIDE = 'build-storybook';
    expect(needsOf(ci.jobs[BESIDE])).toEqual(['room']);
    const reaches = id =>
      needsOf(ci.jobs[id]).some(
        need => need === 'admission' || (need !== BESIDE && reaches(need)),
      );
    for (const id of Object.keys(ci.jobs)) {
      if (!['room', 'admission', 'ci-full', BESIDE].includes(id))
        expect(reaches(id), id).toBe(true);
    }
  });

  it('stops a pull-request run that CI is full for, with the reason, and builds nothing', () => {
    const job = ci.jobs['ci-full'];
    expect(needsOf(job)).toEqual(['room']);
    expect(job.if).toBe(
      "github.event_name == 'pull_request' && needs.room.outputs.full == 'true'",
    );
    expect(job.permissions).toEqual({actions: 'write'});
    const [stop] = job.steps;
    expect(stop['continue-on-error']).toBeUndefined();
    expect(stop.run).toContain('CI is full: re-run all jobs or push later.');
    // It cancels the run when its token can, and fails either way.
    expect(stop.run).toContain('gh run cancel "$GITHUB_RUN_ID"');
    expect(stop.run.trim().split('\n').at(-1)).toBe('exit 1');
    expect(admission.permissions).toEqual({actions: 'read', contents: 'read'});
    expect(String(ci.jobs['build-storybook'].if)).toContain(
      "needs.room.outputs.full != 'true'",
    );
  });

  it("fails a fork's run that CI is full for, which cannot cancel itself, in every required context", () => {
    const isStop = step =>
      step.name === 'Stop when CI is full' &&
      step.if === "needs.room.outputs.full == 'true'" &&
      step.run.includes('CI is full: re-run all jobs or push later.') &&
      step.run.trim().endsWith('exit 1') &&
      step['continue-on-error'] === undefined;
    // Admission fails first, so every job behind it without its own status
    // rule skips.
    expect(isStop(admission.steps[0])).toBe(true);
    // The required contexts run, and fail with the reason before any work.
    for (const id of ['build', 'test', 'docsite-test']) {
      const job = ci.jobs[id];
      expect(needsOf(job), id).toContain('room');
      expect(job.steps[0].name, id).toBe(
        'Require a branch in this repository or the ci:run label',
      );
      expect(isStop(job.steps[1]), id).toBe(true);
    }
    // build runs although the Storybook build it reads skipped.
    expect(String(ci.jobs.build.if)).toContain(
      "needs.room.outputs.full == 'true'",
    );
    // The jobs that would still run behind a failed admission build nothing.
    for (const id of ['typecheck', 'pr-interaction', 'pr-interaction-webkit']) {
      expect(needsOf(ci.jobs[id]), id).toContain('room');
      expect(String(ci.jobs[id].if), id).toContain(
        "needs.room.outputs.full != 'true'",
      );
    }
  });

  it('skips only with every other job, and never fails, so every job and required check decides as before', () => {
    // The pull-request gate every job carries: a draft or an unlabelled fork
    // runs no CI (FR17). Every other event is admitted.
    expect(ci.jobs.room.if).toBe(PR_CI_GATE);
    expect(admission.if).toBe(PR_CI_GATE);
    expect(needsOf(ci.jobs.room)).toEqual([]);
    // Whatever a wait does, a lookup error or its own time limit, its job
    // succeeds, and it finishes before the job's own limit. Only a run CI is
    // full for stops (above).
    expect(stepOf(ci.jobs.room)['continue-on-error']).toBe(true);
    expect(wait['continue-on-error']).toBe(true);
    const limit = (value, event) => {
      const split = /&& (\d+) \|\| (\d+)/.exec(String(value));
      return split
        ? Number(split[event === 'workflow_dispatch' ? 1 : 2])
        : Number(value);
    };
    for (const job of [ci.jobs.room, admission]) {
      const step = stepOf(job);
      expect(step.with).toMatchObject({
        peak: wait.with.peak,
        main: wait.with.main,
        'max-wait-minutes': wait.with['max-wait-minutes'],
        'max-looks': wait.with['max-looks'],
        'label-legs': wait.with['label-legs'],
      });
      for (const event of ['workflow_dispatch', 'pull_request']) {
        // The wait ends before the step's limit, and the step's before the job's.
        expect(limit(step.with['max-wait-minutes'], event)).toBeLessThan(
          limit(step['timeout-minutes'], event),
        );
        expect(limit(step['timeout-minutes'], event)).toBeLessThan(
          limit(job['timeout-minutes'], event),
        );
      }
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
      expect.objectContaining({name: 'Stop when CI is full'}),
      expect.objectContaining({uses: 'actions/checkout@v7'}),
    ]);
    expect(ci.jobs.room.steps.filter(step => step.name !== STEP)).toEqual([
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
          ['maintenance-request', 'room', 'admission'].includes(need) ||
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

  it("gives Main's unit run a peak that covers all its jobs, and a push one for its fast checks", () => {
    const [, push, unit] = /&& (\d+) \|\| (\d+)/
      .exec(stepOf(main.jobs['main-commit']).with.peak)
      .map(Number);
    const held = names =>
      names
        .map(name => legs(main.jobs[name]))
        .reduce((sum, count) => sum + count, 0);
    // A dispatched unit run holds every job beside main-commit and the join.
    expect(unit).toBeGreaterThanOrEqual(
      held(
        Object.keys(main.jobs).filter(
          name => name !== 'main-commit' && name !== 'test',
        ),
      ),
    );
    // A push skips the unit legs (spec:AST-030 FR21).
    const fast = Object.keys(main.jobs).filter(
      name => main.jobs[name].if !== "github.event_name != 'push'",
    );
    expect(push).toBeGreaterThanOrEqual(fast.length);
    expect(push).toBeLessThan(unit);
    expect(estimateOf('deploy.yml')).toContain(
      `run => (run.event === 'push' ? ${push} : ${unit}),`,
    );
  });

  it('gives a pull request a peak that covers every job it starts at once', () => {
    // The jobs that need only the waits start together the moment admission
    // ends; the Storybook build may still be running then.
    const waits = ['room', 'admission'];
    const first = Object.keys(ci.jobs).filter(
      name =>
        !waits.includes(name) &&
        name !== 'ci-full' &&
        needsOf(ci.jobs[name]).every(need => waits.includes(need)),
    );
    const onPullRequest = first.filter(name => {
      const condition = String(ci.jobs[name].if ?? '');
      return !/^(\$\{\{\s*)?(always\(\) && )?github\.event_name == 'workflow_dispatch'/.test(
        condition,
      );
    });
    const started = onPullRequest
      .map(name => legs(ci.jobs[name], 'pull_request'))
      .reduce((sum, count) => sum + count, 0);
    const peak = Number(
      /\|\| (\d+) \}\}$/.exec(stepOf(ci.jobs.admission).with.peak)[1],
    );
    expect(peak).toBeGreaterThanOrEqual(started);
    expect(estimateOf('ci.yml')).toContain(`: ${peak}),`);
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
    merge = false,
    labels = [],
    pull = {},
    error,
    maxWait = 15,
    maxLooks = 8,
    budget = 4000,
    latencyMs = 0,
    random = 0,
    phase = 'whole',
    fits = '',
    started = '',
    looked = '',
    next = '',
  } = {}) {
    vi.useFakeTimers({now: NOW});
    vi.spyOn(Math, 'random').mockReturnValue(random);
    const lookTimes = [];
    let looks = 0;
    let calls = 0;
    const logs = {info: [], warning: []};
    const outputs = {};
    const runs = () => (typeof active === 'function' ? active(looks) : active);
    const github = {
      rest: {
        actions: {
          listWorkflowRunsForRepo: async ({status, event, per_page}) => {
            if (error) throw error;
            expect([event, per_page]).toEqual([undefined, 100]);
            calls += 1;
            if (latencyMs > 0)
              await new Promise(resolve => setTimeout(resolve, latencyMs));
            if (status === 'in_progress') {
              looks += 1;
              lookTimes.push(Date.now() - NOW);
            }
            return {
              data: {
                workflow_runs: runs().filter(run => run.status === status),
              },
              headers: {
                'x-ratelimit-remaining': String(
                  typeof budget === 'function' ? budget() : budget,
                ),
              },
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
      setOutput: (name, value) => (outputs[name] = value),
    };
    const context = {
      repo: {owner: 'o', repo: 'r'},
      runId: OWN,
      payload:
        isMain || merge
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
      PHASE: phase,
      FITS: fits,
      STARTED: started,
      LOOKS: looked,
      NEXT: next,
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
    return {...logs, looks, calls, lookTimes, outputs};
  }

  it("admits at once at today's load: 56 live jobs and many pull-request runs waiting", async () => {
    // 2026-11-01 ~01:50Z: 56 jobs ran, a dozen of them the waiting jobs of
    // pull-request runs. The first estimate counted each waiting run at 12 and
    // saw about 180 jobs, so every run waited out its twelve minutes. Counting
    // what runs: 33 + 11 + 12 waiting jobs + 18 kept for small workflows + this
    // run's 16 = 90.
    const active = [
      ...prs(3, 11),
      admittedRun(30, 11, {
        event: 'push',
        path: '.github/workflows/deploy.yml',
      }),
      ...Array.from({length: 12}, (_, i) => waitingRun(40 + i)),
      ...slims(8),
    ];
    const result = await admit({active, peak: 16, maxWait: 12, maxLooks: 2});
    expect(result.looks).toBe(1);
    expect(result.warning).toEqual([]);
    // Two run listings plus one jobs call per CI or Main run.
    expect(result.calls).toBe(2 + 3 + 1 + 12);
  });

  it("starts a main release-check at tonight's load on its second look, which the three-minute floor still held", async () => {
    // 2026-11-01 10:12Z: a release-check on main waited 579 s, its looks
    // reading 85, 83, 64, 60 and 50 other jobs + 36. Tonight's load: CI 38 and
    // Main 6 live, small workflows 5, nine stale runs. 44 + 18 + 36 = 98 is
    // over ninety, so it waits while pull-request runs yield to it; once one
    // pull-request run's 12 jobs end, 32 + 18 + 36 = 86 fits. The runs were
    // admitted under a minute ago, so their jobs have all appeared; the old
    // three-minute window still counted them at their most on the second
    // look, two minutes later, and kept the check waiting.
    const stale = Array.from({length: 9}, (_, i) => ({
      ...slim(720 + i),
      status: 'queued',
      updated_at: ago(3 * 24 * 60),
    }));
    const rest = [
      admittedRun(92, 2, {admittedMinutesAgo: 0.9}),
      admittedRun(93, 7, {admittedMinutesAgo: 0.85}),
      admittedRun(94, 9, {admittedMinutesAgo: 6.6}),
      admittedRun(95, 8, {admittedMinutesAgo: 0.8}),
      admittedRun(96, 6, {
        event: 'push',
        path: '.github/workflows/deploy.yml',
        admittedMinutesAgo: 0.9,
      }),
      ...slims(5),
      ...stale,
    ];
    const tonight = [admittedRun(91, 12, {admittedMinutesAgo: 0.9}), ...rest];
    const result = await admit({
      active: look => (look < 2 ? tonight : rest),
      isMain: true,
      peak: 36,
    });
    expect(result.looks).toBe(2);
    expect(result.warning).toEqual([]);
    expect(result.info).toContain(
      'Waiting for room: about 62 other jobs + 36.',
    );
    expect(result.info.at(-2)).toContain('about 50 other jobs + 36 <= 90');
    // The second look comes about two minutes in.
    expect(result.lookTimes[1]).toBeLessThanOrEqual(2 * 60_000 + 20_000);
  });

  it('counts live jobs, and a run admitted in the last 45 seconds at least at its most', async () => {
    // 4 x 12 live + 18 small + 13 = 79: room.
    expect((await admit({active: prs(4), peak: 13})).looks).toBe(1);
    // A run admitted 30 s ago with 2 jobs so far counts its planned 16 (95);
    // one admitted a minute ago has all its jobs, and counts its 2 (81).
    const fresh = admittedRun(60, 2, {admittedMinutesAgo: 0.5});
    const settled = admittedRun(60, 2, {admittedMinutesAgo: 1});
    expect(
      (await admit({active: [...prs(4), fresh], peak: 13})).looks,
    ).toBeGreaterThan(1);
    expect((await admit({active: [...prs(4), settled], peak: 13})).looks).toBe(
      1,
    );
  });

  it("admits at once at tonight's load, which the three-minute floor and stale runs counted far over ninety", async () => {
    // 2026-11-01 ~10:00Z: 49 jobs ran (CI 38, Main 6, small workflows 5)
    // while pull-request runs waited twelve minutes, "about 81 other jobs".
    // Runs admitted one to three minutes ago were counted at 16 or 14 though
    // their jobs had all appeared, and GitHub still listed nine long-finished
    // runs as queued.
    const stale = Array.from({length: 9}, (_, i) => ({
      ...slim(700 + i),
      status: 'queued',
      updated_at: ago(3 * 24 * 60),
    }));
    const active = [
      admittedRun(81, 12, {admittedMinutesAgo: 2.2}),
      admittedRun(82, 2, {admittedMinutesAgo: 2}),
      admittedRun(83, 7, {admittedMinutesAgo: 1.5}),
      admittedRun(84, 9, {admittedMinutesAgo: 6.6}),
      admittedRun(85, 8, {admittedMinutesAgo: 1}),
      admittedRun(86, 6, {
        event: 'push',
        path: '.github/workflows/deploy.yml',
        admittedMinutesAgo: 2,
      }),
      ...slims(5),
      ...stale,
    ];
    // 38 + 6 live + 18 kept for small workflows + this run's 16 = 78.
    const result = await admit({active, peak: 16, maxWait: 12, maxLooks: 2});
    expect(result.looks).toBe(1);
    expect(result.warning).toEqual([]);
    // Every look logs what each run counted, and the stale runs it ignored.
    const look = result.info.find(line => line.startsWith('Look 1:'));
    expect(look).toContain('ci 81 pull_request: 12 live');
    expect(look).toContain('deploy 86 push: 6 live');
    expect(look).toContain('Small workflows 5 (pr-comment 5), counted as 18.');
    expect(look).toContain('Ignored 9 stale runs.');
    expect(result.info.at(-2)).toContain('about 62 other jobs + 16 <= 90');
  });

  describe('room for the Storybook build, then the rest of the run', () => {
    it('lets the build start when it fits alone, and records that the run did not', async () => {
      // 5 x 12 + 18 + 1 = 79 fits the build; + 16 = 94 does not fit the run.
      const result = await admit({
        active: prs(5),
        peak: 16,
        phase: 'room',
        maxWait: 12,
        maxLooks: 2,
      });
      expect(result.looks).toBe(1);
      // Near room (four over), so that look spent none of the run's two.
      expect(result.outputs).toMatchObject({fits: 'false', looks: '0'});
      expect(result.outputs.full).toBeUndefined();
      expect(result.info.at(-2)).toContain('Room for the Storybook build');
    });

    it('holds the build too when there is no room even for it', async () => {
      // 7 x 12 + 18 = 102: not one more job fits, and room is further than ten
      // jobs away, so nothing of the run starts and it keeps its two looks.
      const result = await admit({
        active: prs(7),
        peak: 16,
        phase: 'room',
        maxWait: 12,
        maxLooks: 2,
      });
      expect(result.looks).toBe(2);
      expect(result.warning[0]).toContain('Still no room');
    });

    it('records that the whole run fit, so the rest starts without a look', async () => {
      const room = await admit({active: prs(2), peak: 16, phase: 'room'});
      expect(room.outputs.fits).toBe('true');
      const rest = await admit({
        active: prs(2),
        peak: 16,
        phase: 'rest',
        fits: 'true',
        started: String(NOW),
        looked: '1',
      });
      expect(rest).toMatchObject({looks: 0, calls: 0});
    });

    it('starts the rest at once when room did not measure the run', async () => {
      // Room started on an API error or a low budget: it set no `fits`.
      for (const fits of ['']) {
        const rest = await admit({
          active: prs(6),
          peak: 16,
          phase: 'rest',
          fits,
          started: String(NOW),
          looked: '1',
          maxWait: 12,
          maxLooks: 2,
        });
        expect(rest).toMatchObject({looks: 0, calls: 0});
        expect(rest.info).toContain('Room did not measure the run; starting.');
      }
      // A failed room lookup sets looks but not fits.
      const room = await admit({
        active: prs(6),
        peak: 16,
        phase: 'room',
        error: new Error('rate limited'),
      });
      expect(room.outputs.fits ?? '').toBe('');
    });

    it('carries the wait on from room: its clock, its looks and its next look', async () => {
      // Far from room (7 x 12 + 18 + 16 = 118): room planned the second look
      // at the end of the twelve-minute wait, and the rest looks then.
      const far = await admit({
        active: prs(7),
        peak: 16,
        phase: 'rest',
        fits: 'false',
        started: String(NOW),
        looked: '1',
        next: String(NOW + 11.67 * 60_000),
        maxWait: 12,
        maxLooks: 2,
      });
      expect(far.looks).toBe(1);
      expect(far.lookTimes[0]).toBeGreaterThan(11 * 60_000);
      expect(far.lookTimes[0]).toBeLessThanOrEqual(12 * 60_000);
      // Near room, room planned the next look four minutes on.
      const near = await admit({
        active: prs(5),
        peak: 16,
        phase: 'rest',
        fits: 'false',
        started: String(NOW),
        looked: '0',
        next: String(NOW + 4 * 60_000),
        maxWait: 12,
        maxLooks: 2,
      });
      expect(near.lookTimes[0]).toBeGreaterThanOrEqual(4 * 60_000);
      expect(near.lookTimes[0]).toBeLessThanOrEqual(4 * 60_000 + 20_000);
      // Room already spent both looks: the rest starts at once.
      const spent = await admit({
        active: prs(7),
        peak: 16,
        phase: 'rest',
        fits: 'false',
        started: String(NOW),
        looked: '2',
        maxWait: 12,
        maxLooks: 2,
      });
      expect(spent).toMatchObject({looks: 0, calls: 0});
    });

    it('leaves fits unset when a later look stops early, so the rest starts', async () => {
      // Room's first look finds no room even for the build (far over) and
      // records that the run did not fit; its second look meets a low budget
      // and stops.
      let looksSoFar = 0;
      const room = await admit({
        active: looks => {
          looksSoFar = looks;
          return prs(7);
        },
        peak: 16,
        phase: 'room',
        maxWait: 12,
        maxLooks: 4,
        budget: () => (looksSoFar >= 2 ? 1000 : 4000),
      });
      expect(room.looks).toBe(2);
      expect(room.warning.at(-1)).toContain('API calls left this hour');
      expect(room.outputs.fits).toBe('');
      const rest = await admit({
        active: prs(7),
        peak: 16,
        phase: 'rest',
        fits: room.outputs.fits,
        started: String(NOW),
        looked: room.outputs.looks,
        maxWait: 12,
        maxLooks: 4,
      });
      expect(rest).toMatchObject({looks: 0, calls: 0});
    });

    it('looks at the end of the wait, never starts early, when room planned a look past it', async () => {
      // Room found the build room four minutes in, after a near look, with the
      // run then far over; its plan of four plus twelve minutes passes the
      // wait. The rest looks once at the end of the wait, then starts.
      vi.useFakeTimers({now: NOW});
      const started = NOW - 4 * 60_000;
      const rest = await admit({
        active: prs(7),
        peak: 16,
        phase: 'rest',
        fits: 'false',
        started: String(started),
        looked: '1',
        next: String(NOW + 11.67 * 60_000),
        maxWait: 12,
        maxLooks: 2,
      });
      expect(rest.looks).toBe(1);
      expect(rest.lookTimes[0]).toBeGreaterThan(7 * 60_000);
      expect(rest.lookTimes[0]).toBeLessThanOrEqual(8 * 60_000);
      expect(rest.warning[0]).toContain('Still no room');
    });

    it('plans the rest of the run four minutes on when room finds the build room and the run near it', async () => {
      // 5 x 12 + 18 = 78: the build fits; + 16 = 94 is four over, near room.
      const room = await admit({
        active: prs(5),
        peak: 16,
        phase: 'room',
        maxWait: 12,
        maxLooks: 2,
      });
      expect(room.outputs.looks).toBe('0');
      expect(Number(room.outputs.next) - NOW).toBe(4 * 60_000);
      // Far: 6 x 12 + 18 + 1 = 91 does not fit even the build; with 5 runs of
      // 14 (88), the build fits and the run, 16 more, is fourteen over.
      const wide = await admit({
        active: prs(5, 14),
        peak: 16,
        phase: 'room',
        maxWait: 12,
        maxLooks: 2,
      });
      expect(wide.outputs.looks).toBe('1');
      expect(Number(wide.outputs.next) - NOW).toBeGreaterThan(11 * 60_000);
    });

    it('sees a run as waiting while either of its waits is in progress', async () => {
      // Room is done and admission waits: a waiting pull-request run that holds
      // its waiting job and the build that found room.
      const twoWaits = {
        id: 77,
        status: 'in_progress',
        event: 'pull_request',
        path: '.github/workflows/ci.yml',
        jobs: [
          {
            status: 'completed',
            steps: [{name: STEP, status: 'completed', completed_at: ago(3)}],
          },
          {status: 'in_progress', steps: [{name: STEP, status: 'in_progress'}]},
          {status: 'in_progress', steps: []},
        ],
      };
      const result = await admit({active: [twoWaits], peak: 16});
      expect(result.info.find(line => line.startsWith('Look 1:'))).toContain(
        'ci 77 pull_request: 2 waiting',
      );
    });
  });

  describe('CI is full', () => {
    const waiting = count =>
      Array.from({length: count}, (_, i) => waitingRun(300 + i));

    it('turns away a pull-request run that finds no room and ten others waiting', async () => {
      // 5 x 12 + 10 waiting + 18 + 16 = 104: no room, and ten already wait.
      const result = await admit({
        active: [...prs(5), ...waiting(10)],
        peak: 16,
        phase: 'room',
        maxWait: 12,
        maxLooks: 2,
      });
      expect(result.looks).toBe(1);
      expect(result.outputs.full).toBe('true');
      expect(result.warning[0]).toContain(
        'CI is full: 10 pull-request runs are already waiting',
      );
    });

    it('counts only waiting pull-request runs toward the ten', async () => {
      const queued = Array.from({length: 12}, (_, i) =>
        waitingRun(400 + i, {event: 'merge_group'}),
      );
      const result = await admit({
        active: [...prs(5), ...waiting(9), ...queued],
        peak: 16,
        phase: 'room',
        maxWait: 12,
        maxLooks: 2,
      });
      expect(result.outputs.full).toBeUndefined();
    });

    it('never turns away a merge-queue entry', async () => {
      // A merge-queue run is not `main`, and carries no pull request.
      const entry = await admit({
        active: [...prs(5), ...waiting(12)],
        peak: 16,
        phase: 'room',
        merge: true,
        maxWait: 12,
        maxLooks: 2,
      });
      expect(entry.outputs.full).toBeUndefined();
      // It waits (one job past room, so it looks every four minutes).
      expect(entry.looks).toBeGreaterThan(1);
    });

    it('lets the tenth waiter wait, and never turns away a run that fits or a main run', async () => {
      const ninth = await admit({
        active: [...prs(5), ...waiting(9)],
        peak: 16,
        phase: 'room',
        maxWait: 12,
        maxLooks: 2,
      });
      expect(ninth.outputs.full).toBeUndefined();
      const fits = await admit({
        active: [...prs(1), ...waiting(12)],
        peak: 16,
        phase: 'room',
      });
      expect(fits.outputs).toMatchObject({fits: 'true'});
      expect(fits.outputs.full).toBeUndefined();
      const mainRun = await admit({
        active: [...prs(5), ...waiting(12)],
        peak: 37,
        isMain: true,
        phase: 'room',
      });
      expect(mainRun.outputs.full).toBeUndefined();
    });
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

  it('waits out its second look even when the first is slow and the jitter long', async () => {
    // 8 s per run listing and a jitter of almost 20 s: the second look still
    // comes, about twelve minutes in, rather than giving up after one.
    const pull = await admit({
      active: prs(6),
      maxWait: 12,
      maxLooks: 2,
      latencyMs: 8_000,
      random: 0.999,
    });
    expect(pull.looks).toBe(2);
    expect(pull.lookTimes[1]).toBeGreaterThan(11 * 60_000);
    // Recorded once its first listing returns, 8 s after the look began.
    expect(pull.lookTimes[1]).toBeLessThanOrEqual(12 * 60_000 + 8_000);
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

  it('starts a pull-request run within one two-minute look of a waiting main check starting', async () => {
    // 2026-11-01 16:16Z: a pull-request run yielded to a main push waiting
    // for room, slept to its second look twelve minutes later, though the push
    // started at 16:17. Here main waits two and a half minutes.
    const MAIN_WAIT = 150_000;
    const others = prs(3);
    const result = await admit({
      active: () =>
        Date.now() - NOW < MAIN_WAIT
          ? [
              ...others,
              waitingRun(71, {
                event: 'push',
                path: '.github/workflows/deploy.yml',
              }),
            ]
          : [
              ...others,
              admittedRun(71, 4, {
                event: 'push',
                path: '.github/workflows/deploy.yml',
              }),
            ],
      peak: 16,
      maxWait: 12,
      maxLooks: 2,
    });
    expect(result.warning).toEqual([]);
    const started = result.lookTimes.at(-1);
    expect(started).toBeGreaterThanOrEqual(MAIN_WAIT);
    expect(started - MAIN_WAIT).toBeLessThanOrEqual(2 * 60_000 + 20_000);
    // Yield looks do not spend the run's two looks.
    expect(result.looks).toBe(3);
  });

  it('looks every four minutes when a run is within ten jobs of room', async () => {
    // 2026-11-01 18:42Z: a pull-request run was two jobs over (64 live + 18
    // kept for small workflows + 16 = 98), and its only other look came
    // twelve minutes later. Here room frees five minutes in.
    const FREES = 5 * 60_000;
    const result = await admit({
      active: () => {
        const runs = [...prs(5), admittedRun(60, 4)];
        return Date.now() - NOW < FREES ? runs : runs.slice(1);
      },
      peak: 16,
      maxWait: 12,
      maxLooks: 2,
    });
    expect(result.warning).toEqual([]);
    // Looks at 0, about 4 and about 8 minutes: room by the third.
    expect(result.looks).toBe(3);
    expect(result.lookTimes[1]).toBeGreaterThanOrEqual(4 * 60_000);
    expect(result.lookTimes[1]).toBeLessThanOrEqual(4 * 60_000 + 20_000);
    expect(result.lookTimes[2] - FREES).toBeLessThanOrEqual(
      4 * 60_000 + 20_000,
    );
    // Near looks stay inside the twelve-minute wait.
    const stuck = await admit({
      active: [...prs(5), admittedRun(60, 4)],
      peak: 16,
      maxWait: 12,
      maxLooks: 2,
    });
    expect(stuck.looks).toBe(4);
    expect(stuck.lookTimes.at(-1)).toBeLessThanOrEqual(12 * 60_000);
    expect(stuck.warning[0]).toContain('Still no room');
  });

  it('keeps two looks when there is no room, a waiting main check or not', async () => {
    // 6 x 12 + 18 + 16 = 106: sixteen over, further than ten from room, so
    // neither the yield nor nearness shortens the wait.
    const result = await admit({
      active: [...prs(6), waitingRun(72, {event: 'workflow_dispatch'})],
      peak: 16,
      maxWait: 12,
      maxLooks: 2,
    });
    expect(result.looks).toBe(2);
    expect(result.lookTimes[1]).toBeGreaterThan(11 * 60_000);
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
    // It would fit but yields, so it looks again in two minutes, not twelve.
    expect(held.lookTimes[1]).toBeLessThanOrEqual(2 * 60_000 + 20_000);
    // A waiting pull-request run whose Storybook build started beside its
    // wait holds both: 48 + 2 x 4 + 18 + 16 = 90 fits; a fifth does not.
    const building = id => ({
      ...waitingRun(id),
      jobs: [...waitingRun(id).jobs, {status: 'in_progress', steps: []}],
    });
    const withBuilds = count =>
      Array.from({length: count}, (_, i) => building(90 + i));
    expect(
      (await admit({active: [...prs(4), ...withBuilds(4)], peak: 16})).looks,
    ).toBe(1);
    expect(
      (await admit({active: [...prs(4), ...withBuilds(5)], peak: 16})).looks,
    ).toBeGreaterThan(1);
    // Other pull-request runs waiting for room hold only their waiting jobs:
    // 48 + 8 waiting + 18 + 16 = 90 fits; a ninth waiting run does not.
    const waiting = count =>
      Array.from({length: count}, (_, i) => waitingRun(80 + i));
    expect(
      (await admit({active: [...prs(4), ...waiting(8)], peak: 16})).looks,
    ).toBe(1);
    expect(
      (await admit({active: [...prs(4), ...waiting(9)], peak: 16})).looks,
    ).toBeGreaterThan(1);
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
