// Copyright (c) Meta Platforms, Inc. and affiliates.

import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import yaml from 'yaml';
import {
  JOB_LIMIT_SECONDS,
  LEG_BUDGET_SECONDS,
  MAIN_WARN_MINUTES,
  MAX_MIN_NODE_LEGS,
  MIN_NODE_DURATIONS,
  MIN_NODE_LEG_BUDGET_SECONDS,
  MIN_NODE_SETUP_SECONDS,
  MIN_NODE_TARGET_MINUTES,
  MIN_NODE_TEST_SECONDS_PER_WALL_SECOND,
  MAX_MAIN_NODE_LEGS,
  MAX_NODE_LEGS,
  SLOW_RUNNER,
  PER_FILE_SECONDS,
  RECORD_DRIFT,
  SETUP_SECONDS,
  TEST_SECONDS_PER_WALL_SECOND,
  TIGHT_NODE_LEGS,
  WALL_SECONDS,
  WATCHDOG_MARGIN_SECONDS,
  nodeFileCost,
  nodeLegFiles,
  mainNearLimitNotice,
  minNodeLegFiles,
  minNodeLegMinutes,
  overBudgetNotice,
  planMinNodeLegs,
  planMainNodeLegs,
  projectedLegMinutes,
  planNodeLegs,
  readDurations,
  RECORDS,
  recordProblem,
  stepOutputs,
} from './vitest-node-legs.mjs';
import {splitByDuration} from './lib/duration-split.mjs';
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

  it("plans Main's unit run with the swizzle proof's slices, which run in its Node legs", () => {
    const mainFiles = nodeLegFiles(ROOT, {swizzleProofOwnJob: false});
    const slices = mainFiles.filter(file =>
      /swizzle-proof\.\d+\.test\.mjs$/.test(file),
    );
    expect(slices.length).toBeGreaterThan(0);
    // A pull request's legs leave them out; Main's add exactly them.
    expect(files.filter(file => slices.includes(file))).toEqual([]);
    expect(mainFiles.length).toBe(files.length + slices.length);
    // As many legs as shorten the slowest leg (DEC-17): its longest leg is
    // the longest at the most legs, and one fewer would be longer.
    const mainPlan = planMainNodeLegs(mainFiles, seconds);
    expect(mainPlan.legs).toBeLessThanOrEqual(MAX_MAIN_NODE_LEGS);
    const cost = nodeFileCost(mainFiles, seconds);
    const longestAt = count =>
      Math.max(
        ...partitionByDuration(mainFiles, count, seconds).map(leg =>
          leg.reduce((sum, file) => sum + cost(file), 0),
        ),
      );
    expect(mainPlan.longest).toBeCloseTo(longestAt(MAX_MAIN_NODE_LEGS));
    if (mainPlan.legs > 1)
      expect(longestAt(mainPlan.legs - 1)).toBeGreaterThan(mainPlan.longest);
    // The command Main runs plans the same files, and never fails: a plan
    // past its budget warns and runs the most legs.
    const out = spawnSync(
      process.execPath,
      ['scripts/vitest-node-legs.mjs', 'plan', '--main'],
      {cwd: ROOT, encoding: 'utf8'},
    );
    expect(out.status, out.stderr).toBe(0);
    expect(out.stdout).toContain(`${mainFiles.length} Node test files`);
    expect(out.stdout).toContain(`: ${mainPlan.legs} legs,`);
    expect(out.stdout).not.toContain('::error');
    if (!mainPlan.fits)
      expect(out.stdout).toContain('::warning title=Node legs over budget::');
  });

  it("keeps Main's slowest Node leg under twelve minutes on a runner 1.28 times slower than measured", () => {
    // On the record Main's planner reads (scripts/vitest-node-durations.json):
    // a change that grows the suite past the line fails here.
    expect(SLOW_RUNNER).toBe(1.28);
    const mainFiles = nodeLegFiles(ROOT, {swizzleProofOwnJob: false});
    const mainPlan = planMainNodeLegs(mainFiles, seconds);
    expect(projectedLegMinutes(mainPlan.longest)).toBeCloseTo(
      (SETUP_SECONDS +
        (mainPlan.longest / TEST_SECONDS_PER_WALL_SECOND) * 1.28) /
        60,
    );
    expect(projectedLegMinutes(mainPlan.longest)).toBeLessThan(12);
    expect(mainPlan.fits, mainPlan.reason).toBe(true);
    expect(mainNearLimitNotice(mainPlan)).toBeNull();
  });

  it("warns on main's validation, never failing, when Main's slowest leg nears its limit", () => {
    // The test seconds at which a leg reaches the warning line.
    const line =
      ((MAIN_WARN_MINUTES * 60 - SETUP_SECONDS) / SLOW_RUNNER) *
      TEST_SECONDS_PER_WALL_SECOND;
    expect(mainNearLimitNotice({legs: 12, longest: line - 1})).toBeNull();
    expect(mainNearLimitNotice({legs: 12, longest: line + 1})).toMatch(
      /^::warning title=Main Node legs near their limit::At 12 legs/,
    );
  });

  it('gives Main fewer legs only where the slowest file already sets the floor', () => {
    // Many even files: every leg more shortens the slowest, so the most legs.
    const even = Object.fromEntries(
      Array.from({length: 96}, (_, i) => [`even${i}.test.mjs`, 100]),
    );
    expect(planMainNodeLegs(Object.keys(even), even).legs).toBe(
      MAX_MAIN_NODE_LEGS,
    );
    // One file longer than all the rest together: two legs reach its floor.
    const floor = {
      'huge.test.mjs': 1000,
      'a.test.mjs': 1,
      'b.test.mjs': 1,
      'c.test.mjs': 1,
    };
    expect(planMainNodeLegs(Object.keys(floor), floor).legs).toBe(2);
  });

  it('warns on Main and fails a pull request when a plan is past its budget', () => {
    const over = {fits: false, reason: 'too slow'};
    expect(overBudgetNotice(over, {main: true})).toEqual({
      level: 'warning',
      line: '::warning title=Node legs over budget::too slow',
    });
    expect(overBudgetNotice(over)).toEqual({
      level: 'error',
      line: '::error title=Node legs over budget::too slow',
    });
    expect(overBudgetNotice({fits: true, reason: ''}, {main: true})).toBeNull();
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

describe("the CLI's legs on its minimum Node", () => {
  const files = minNodeLegFiles(ROOT);
  const seconds = readDurations(MIN_NODE_DURATIONS);

  it("collects only the CLI package's test files, as `pnpm -F @astryxdesign/cli test` does", () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files.every(file => file.startsWith('packages/cli/'))).toBe(true);
    expect(files).toContain(
      'packages/cli/test/swizzle-proof/swizzle-proof.1.test.mjs',
    );
  });

  it('derives the budget from the 20-minute target and the pace measured on Node 22.13', () => {
    expect(MIN_NODE_LEG_BUDGET_SECONDS).toBe(
      (MIN_NODE_TARGET_MINUTES * 60 - MIN_NODE_SETUP_SECONDS) *
        MIN_NODE_TEST_SECONDS_PER_WALL_SECOND,
    );
    // Run 44258944787's four legs: 2,704, 2,279, 3,363 and 3,461 recorded
    // seconds took 18.8, 15.7, 22.7 and 23.3 minutes of their test step, about
    // 40 s after their job started. The projection stays above each, by at
    // most three minutes.
    for (const [seconds, minutes] of [
      [2704, 18.8],
      [2279, 15.7],
      [3363, 22.7],
      [3461, 23.3],
    ]) {
      expect(minNodeLegMinutes(seconds)).toBeGreaterThan(minutes + 0.6);
      expect(minNodeLegMinutes(seconds)).toBeLessThan(minutes + 3);
    }
  });

  it('plans the fewest legs that keep the slowest at or under the target on the repository record', () => {
    const plan = planMinNodeLegs(files, seconds);
    expect(plan.fits).toBe(true);
    expect(plan.minutes).toBeLessThanOrEqual(MIN_NODE_TARGET_MINUTES);
    if (plan.legs > 1) {
      const fewer = splitByDuration(
        files,
        plan.legs - 1,
        nodeFileCost(files, seconds),
      ).map(leg =>
        leg.reduce((sum, file) => sum + nodeFileCost(files, seconds)(file), 0),
      );
      expect(Math.max(...fewer)).toBeGreaterThan(MIN_NODE_LEG_BUDGET_SECONDS);
    }
  });

  it('runs the most legs and says why, never stopping, when the suite outgrows the target', () => {
    const slow = Object.fromEntries(files.map(file => [file, 100]));
    const plan = planMinNodeLegs(files, slow);
    expect(plan.legs).toBe(MAX_MIN_NODE_LEGS);
    expect(plan.fits).toBe(false);
    expect(plan.reason).toContain('past the 20-minute target');
    const out = execFileSync(
      process.execPath,
      [path.join(ROOT, 'scripts/vitest-node-legs.mjs'), 'plan', '--min-node'],
      {cwd: ROOT, encoding: 'utf8'},
    );
    expect(out).toMatch(/"shards":"\[1(,\d+)*\]"/);
  });
});

describe('a recorded-times file the plan can use', () => {
  const write = text => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-times-'));
    const file = path.join(dir, 'vitest-node-durations.json');
    fs.writeFileSync(file, text);
    return file;
  };

  it('accepts a map of seconds per file, and names what is wrong otherwise', () => {
    expect(recordProblem(write('{"seconds": {"a.test.mjs": 1.5}}'))).toBeNull();
    expect(recordProblem(write('{"seconds": '))).toMatch(/cannot be read/);
    expect(recordProblem(write('{"secs": {}}'))).toMatch(/no map of seconds/);
    expect(recordProblem(write('{"seconds": {"a.test.mjs": "1"}}'))).toMatch(
      /records "1" seconds for a.test.mjs/,
    );
    expect(recordProblem(write('{"seconds": {"a.test.mjs": -1}}'))).toMatch(
      /records -1 seconds/,
    );
  });

  it('holds for the repository records', () => {
    for (const file of RECORDS) expect(recordProblem(file), file).toBeNull();
  });
});
