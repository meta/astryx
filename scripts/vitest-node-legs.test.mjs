// Copyright (c) Meta Platforms, Inc. and affiliates.

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import yaml from 'yaml';
import {
  JOB_LIMIT_SECONDS,
  LEG_BUDGET_SECONDS,
  MAX_NODE_LEGS,
  PER_FILE_SECONDS,
  RECORD_DRIFT,
  SETUP_SECONDS,
  TEST_SECONDS_PER_WALL_SECOND,
  TIGHT_NODE_LEGS,
  WALL_SECONDS,
  WATCHDOG_MARGIN_SECONDS,
  nodeFileCost,
  nodeLegFiles,
  planNodeLegs,
  readDurations,
  stepOutputs,
} from './vitest-node-legs.mjs';
import {partitionByDuration} from './vitest-shard-sequencer.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ci = yaml.parse(
  fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8'),
);
const files = nodeLegFiles();
const seconds = readDurations();
const plan = planNodeLegs(files, seconds);

describe('the Node leg plan', () => {
  it("derives each leg's budget from test-node's job limit, its watchdog and its setup", () => {
    const job = ci.jobs['test-node'];
    expect(job['timeout-minutes'] * 60).toBe(JOB_LIMIT_SECONDS);
    const tests = job.steps.find(step => step.id === 'node-tests');
    expect(tests.run).toContain(
      `VITEST_SHARD_WATCHDOG_SECONDS=$(( ${(JOB_LIMIT_SECONDS - WATCHDOG_MARGIN_SECONDS) / 60} * 60 - \${started:-180} ))`,
    );
    expect(WALL_SECONDS).toBe(
      JOB_LIMIT_SECONDS - WATCHDOG_MARGIN_SECONDS - SETUP_SECONDS,
    );
    expect(LEG_BUDGET_SECONDS).toBeCloseTo(
      (WALL_SECONDS * TEST_SECONDS_PER_WALL_SECOND) / RECORD_DRIFT,
    );
    // A leg that plans its whole budget and runs the most over its plan seen
    // still ends before the watchdog fires.
    expect(
      (LEG_BUDGET_SECONDS * RECORD_DRIFT) / TEST_SECONDS_PER_WALL_SECOND,
    ).toBeLessThanOrEqual(WALL_SECONDS + 1e-9);
  });

  it('fits the recorded Node suite inside the budget, in the legs the sequencer splits', () => {
    expect(plan.fits, plan.reason).toBe(true);
    expect(plan.legs).toBeGreaterThanOrEqual(1);
    expect(plan.legs).toBeLessThanOrEqual(MAX_NODE_LEGS);
    // Each leg's sequencer splits the same files the same way, so its share
    // is a share the plan checked.
    const cost = nodeFileCost(files, seconds);
    const legs = partitionByDuration(files, plan.legs, seconds);
    const totals = legs.map(leg => leg.reduce((sum, f) => sum + cost(f), 0));
    expect(Math.max(...totals)).toBeCloseTo(plan.longest);
    expect(Math.max(...totals)).toBeLessThanOrEqual(LEG_BUDGET_SECONDS);
    // The fewest legs that fit: one fewer would not.
    if (plan.legs > 1) {
      const fewer = partitionByDuration(files, plan.legs - 1, seconds);
      expect(
        Math.max(...fewer.map(leg => leg.reduce((sum, f) => sum + cost(f), 0))),
      ).toBeGreaterThan(LEG_BUDGET_SECONDS);
    }
  });

  it('books a file with no recorded time at the ninetieth percentile, never 0 or the median', () => {
    const record = {};
    for (let i = 1; i <= 10; i += 1) record[`t${i}.test.mjs`] = i;
    const names = [...Object.keys(record), 'new.test.mjs'];
    const cost = nodeFileCost(names, record);
    expect(cost('new.test.mjs')).toBe(9 + PER_FILE_SECONDS);
    expect(cost('t1.test.mjs')).toBe(1 + PER_FILE_SECONDS);
    // A file that runs no test in this run costs only its import.
    const idle = nodeFileCost(names, record, {idle: new Set(['t10.test.mjs'])});
    expect(idle('t10.test.mjs')).toBe(PER_FILE_SECONDS);
  });

  it('fails loudly, never overfills, when the suite does not fit at the most legs', () => {
    const budget = Math.floor(LEG_BUDGET_SECONDS);
    const many = Object.fromEntries(
      Array.from({length: MAX_NODE_LEGS + 1}, (_, i) => [
        `slow${i}.test.mjs`,
        budget - 1,
      ]),
    );
    const over = planNodeLegs(Object.keys(many), many);
    expect(over.fits).toBe(false);
    expect(over.legs).toBe(MAX_NODE_LEGS);
    expect(over.reason).toMatch(
      new RegExp(`at ${MAX_NODE_LEGS} legs, the most a run starts`),
    );
    const one = {'huge.test.mjs': budget + 10, 'small.test.mjs': 1};
    const alone = planNodeLegs(Object.keys(one), one);
    expect(alone.fits).toBe(false);
    expect(alone.reason).toMatch(/^huge\.test\.mjs alone plans/);
  });

  it('gives ci.yml one count: the matrix, the widths admission picks from, and the jobs it adds at full width', () => {
    const swizzle = {'swizzle-proof': {tight: 2, full: 8}};
    const out = stepOutputs({legs: 6, fits: true, reason: ''}, swizzle);
    expect(JSON.parse(out.shards)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(JSON.parse(out['leg-widths'])).toEqual({
      'test-node': {tight: TIGHT_NODE_LEGS, full: 6},
      ...swizzle,
    });
    expect(out.widen).toBe(String(6 - TIGHT_NODE_LEGS + 6));
    // Never more legs at tight width than the plan has.
    expect(
      JSON.parse(
        stepOutputs({legs: 1, fits: true, reason: ''}, {})['leg-widths'],
      ),
    ).toEqual({'test-node': {tight: 1, full: 1}});
  });

  it('runs in room before admission, and a suite past its budget stops every Node leg with the reason', () => {
    const room = ci.jobs.room;
    const step = room.steps.find(each => each.id === 'node-legs');
    expect(step['continue-on-error']).toBe(true);
    expect(step['working-directory']).toBe('.ci-admission');
    expect(step.run).toContain(
      'node scripts/vitest-node-legs.mjs plan --github-output',
    );
    // Room's sparse checkout holds the planner and what it reads.
    const sparse = room.steps.find(each => each.with?.path === '.ci-admission')
      .with['sparse-checkout'];
    expect(sparse.split('\n')).toEqual(
      expect.arrayContaining(['scripts/lib', '.github/scripts/lib']),
    );
    const names = room.steps.map(each => each.name);
    expect(names.indexOf(step.name)).toBeLessThan(
      names.indexOf('Wait for room under the CI ceiling'),
    );
    // Right after the step that names its max-parallel limit for admission's
    // count, before any setup.
    const legs = ci.jobs['test-node'];
    expect(legs.steps[0].name).toBe(
      'Run at most ${{ strategy.max-parallel }} legs at once',
    );
    expect(legs.steps[1]).toMatchObject({
      name: 'Stop when the Node legs do not fit their budget',
      if: "needs.room.outputs.node-fits != 'true'",
      env: {REASON: '${{ needs.room.outputs.node-reason }}'},
    });
    expect(legs.steps[1].run).toContain('exit 1');
    expect(room.outputs['node-fits']).toBe(
      '${{ steps.node-legs.outputs.fits }}',
    );
    expect(room.outputs['node-reason']).toBe(
      '${{ steps.node-legs.outputs.reason }}',
    );
  });

  it('gives every leg files on a scoped run: the guards it always runs are nearly the whole suite', () => {
    // A scoped pull-request run lists the tests its change reaches and every
    // guard that reads sources (fs-guard-tests.mjs). With no change at all,
    // the guards alone still give each planned leg a share.
    const result = spawnSync(
      process.execPath,
      [path.join(ROOT, '.github/scripts/fs-guard-tests.mjs')],
      {cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024},
    );
    expect(result.status, result.stderr).toBe(0);
    const node = new Set(files);
    const guards = result.stdout.split('\n').filter(file => node.has(file));
    const legs = partitionByDuration(guards, plan.legs, seconds);
    for (const leg of legs) expect(leg.length).toBeGreaterThan(0);
    const cost = nodeFileCost(guards, seconds);
    const share = guards.reduce((sum, file) => sum + cost(file), 0);
    expect(share / plan.total).toBeGreaterThan(0.5);
  });
});
