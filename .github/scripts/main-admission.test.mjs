// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A `main` full check waits for room under CI's ceiling before its legs
 *   start (.github/actions/main-admission, spec:AST-030 FR16, DEC-16).
 * @input The action, the CI and Main workflows, and a stubbed GitHub API
 * @output When a main run starts, which runs it counts, how long it can wait,
 *   and that each workflow's `peak` covers the jobs it can hold at once
 * @position Node contracts beside heavy-caps-action.test.mjs, which holds pull
 *   requests' heavy suites while this step runs
 */

import fs from 'node:fs';
import path from 'node:path';

import {afterEach, describe, expect, it, vi} from 'vitest';
import yaml from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const read = file => yaml.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const action = read('.github/actions/main-admission/action.yml');
const ci = read('.github/workflows/ci.yml');
const main = read('.github/workflows/deploy.yml');
const script = action.runs.steps[0].with.script;
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const STEP = 'Wait for room under the CI ceiling';
const CEILING = Number(/const CI_CEILING = (\d+);/.exec(script)[1]);

/** The admission step, its checkout, and the peak it passes, in one job. */
function admission(job) {
  const index = job.steps.findIndex(step => step.name === STEP);
  return {index, step: job.steps[index], checkout: job.steps[index - 1]};
}

/** Legs a job runs on a dispatch: its matrix size, or one. */
function legs(job) {
  const matrix = job.strategy?.matrix;
  if (matrix == null) return 1;
  const values = Object.values(matrix).map(value => {
    if (Array.isArray(value)) return value;
    // A release-check's wider legs (spec:AST-030): the dispatch branch.
    const event =
      /fromJSON\(github\.event_name == 'workflow_dispatch' && '([^']*)' \|\|/.exec(
        String(value),
      );
    return event ? JSON.parse(event[1]) : [value];
  });
  return values.reduce((product, list) => product * list.length, 1);
}

describe('where main waits', () => {
  it("runs in build-storybook before a release-check's legs start, on dispatches only", () => {
    const job = ci.jobs['build-storybook'];
    const {index, step, checkout} = admission(job);
    expect(step.uses).toBe('./.main-admission/.github/actions/main-admission');
    expect(step.if).toBe("github.event_name == 'workflow_dispatch'");
    expect(checkout).toMatchObject({
      if: "github.event_name == 'workflow_dispatch'",
      uses: 'actions/checkout@v7',
      with: {
        'sparse-checkout': '.github/actions/main-admission',
        path: '.main-admission',
      },
    });
    const build = job.steps.findIndex(
      item => item.name === 'Build packages and Storybook',
    );
    expect(index).toBeLessThan(build);
    expect(job.permissions.actions).toBe('read');
  });

  it("runs in main-commit, which every lane of Main's unit run needs", () => {
    const job = main.jobs['main-commit'];
    const {step, checkout} = admission(job);
    expect(step.uses).toBe('./.main-admission/.github/actions/main-admission');
    expect(step.if).toBeUndefined();
    expect(checkout.with).toMatchObject({
      'sparse-checkout': '.github/actions/main-admission',
      path: '.main-admission',
    });
    expect(job.permissions.actions).toBe('read');
    for (const lane of ['test-ui', 'test-node', 'typecheck'])
      expect([main.jobs[lane].needs].flat()).toContain('main-commit');
  });

  it('gives a release-check a peak that covers every job it can hold at once', () => {
    // The jobs a release-check runs are the ones its join needs. A job that
    // every leg needs (build-storybook, run-labels) has finished before the
    // legs start, and each join needs legs that have finished, so the most
    // held at once is every leg plus the other first jobs.
    const closure = new Set();
    const visit = name => {
      for (const need of [ci.jobs[name].needs ?? []].flat()) {
        if (need === 'maintenance-request' || closure.has(need)) continue;
        closure.add(need);
        visit(need);
      }
    };
    visit('release-check');
    const needs = name =>
      [ci.jobs[name].needs ?? []].flat().filter(need => closure.has(need));
    const first = [...closure].filter(name => needs(name).length === 0);
    const wave = [...closure].filter(
      name =>
        needs(name).length > 0 &&
        needs(name).every(need => first.includes(need)),
    );
    const before = first.filter(name =>
      wave.every(job => needs(job).includes(name)),
    );
    expect(before).toEqual(expect.arrayContaining(['build-storybook']));
    const held =
      wave.reduce((sum, name) => sum + legs(ci.jobs[name]), 0) +
      first
        .filter(name => !before.includes(name))
        .reduce((sum, name) => sum + legs(ci.jobs[name]), 0);
    const peak = admission(ci.jobs['build-storybook']).step.with.peak;
    expect(peak).toBeGreaterThanOrEqual(held);
    expect(peak).toBeLessThanOrEqual(CEILING);
  });

  it("gives Main's unit run a peak that covers its legs beside sync-exports", () => {
    const lanes = Object.keys(main.jobs).filter(name =>
      [main.jobs[name].needs ?? []].flat().includes('main-commit'),
    );
    const held =
      lanes
        .filter(name => name !== 'test')
        .reduce((sum, name) => sum + legs(main.jobs[name]), 0) +
      legs(main.jobs['sync-exports']);
    const peak = admission(main.jobs['main-commit']).step.with.peak;
    expect(peak).toBeGreaterThanOrEqual(held);
  });
});

describe('main admission', () => {
  afterEach(() => vi.useRealTimers());
  const OWN = 1;
  const runOf = (id, live, status = 'in_progress') => ({
    id,
    status,
    jobs: Array.from({length: live}, () => 'in_progress'),
  });

  /** Runs the action with fake timers; returns logs, looks and API calls. */
  async function admit({active = [], peak = 36, error, minutes = 20} = {}) {
    vi.useFakeTimers();
    let looks = 0;
    let calls = 0;
    const logs = {info: [], warning: []};
    const reads = new Map();
    const runs = () => (typeof active === 'function' ? active(looks) : active);
    const github = {
      paginate: async (method, params) => {
        const {data} = await method(params);
        return data.workflow_runs ?? data.jobs;
      },
      rest: {
        actions: {
          listWorkflowRunsForRepo: async ({status, event}) => {
            if (error) throw error;
            expect(event).toBeUndefined();
            calls += 1;
            if (status === 'in_progress') looks += 1;
            return {
              data: {
                workflow_runs: runs().filter(run => run.status === status),
              },
            };
          },
          listJobsForWorkflowRun: async ({run_id, per_page}) => {
            expect(per_page).toBe(100);
            calls += 1;
            reads.set(run_id, (reads.get(run_id) ?? 0) + 1);
            const run = runs().find(item => item.id === run_id);
            return {data: {jobs: run.jobs.map(status => ({status}))}};
          },
        },
      },
    };
    const core = {
      info: message => logs.info.push(message),
      warning: message => logs.warning.push(message),
    };
    const saved = process.env.PEAK;
    process.env.PEAK = String(peak);
    try {
      const done = new AsyncFunction('github', 'context', 'core', script)(
        github,
        {repo: {owner: 'o', repo: 'r'}, runId: OWN},
        core,
      );
      // Observed here; `await done` below still rethrows a failure.
      done.catch(() => {});
      await vi.advanceTimersByTimeAsync(minutes * 60_000);
      await done;
    } finally {
      if (saved === undefined) delete process.env.PEAK;
      else process.env.PEAK = saved;
    }
    return {...logs, looks, calls, reads};
  }

  it('starts at once when its peak fits beside the other runs', async () => {
    const result = await admit({
      active: [runOf(50, CEILING - 36), runOf(OWN, 3)],
    });
    expect(result.looks).toBe(1);
    expect(result.warning).toEqual([]);
    // Its own run's jobs are part of its peak, not of the others.
    expect(result.reads.get(OWN)).toBeUndefined();
  });

  it('waits while the others leave no room, and starts when they have finished', async () => {
    const result = await admit({
      active: look => [runOf(50, look < 3 ? CEILING - 35 : CEILING - 36)],
    });
    expect(result.looks).toBe(3);
    expect(result.warning).toEqual([]);
  });

  it('starts after fifteen minutes at most, looking every two', async () => {
    const result = await admit({active: [runOf(50, CEILING)]});
    expect(result.looks).toBe(8);
    expect(result.warning[0]).toContain('after fifteen minutes');
  });

  it('reads each run once per look', async () => {
    const twice = runOf(50, 10);
    const result = await admit({active: [twice, {...twice, status: 'queued'}]});
    expect(result.reads.get(50)).toBe(1);
    expect(result.info.at(-1)).toBe('Main admission: 3 API calls.');
  });

  it('starts when the API cannot be read, rate limit included', async () => {
    const result = await admit({error: new Error('API rate limit exceeded')});
    expect(result.warning[0]).toContain('could not be checked');
    expect(result.looks).toBe(0);
  });

  it('refuses a peak that is not a positive integer', async () => {
    await expect(admit({peak: 0})).rejects.toThrow('positive integer');
  });
});
