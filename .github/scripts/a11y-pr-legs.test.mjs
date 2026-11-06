// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract: a pull request's opt-in accessibility specs run in legs.
 *
 * The browser-specs job runs its selection on one worker, and the files'
 * recorded times assume one browser per core, so more workers on one runner
 * only stretch each file. The job instead splits the selection into up to
 * three legs by recorded time, each about ten minutes or less, inside the
 * job's fifteen minutes. A leg the selection does not need stops after its
 * count step, before any install.
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {afterAll, describe, expect, it} from 'vitest';
import yaml from 'yaml';

import {LEG_BUDGET_MS, legShares, planLegs} from './a11y-pr-contracts.mjs';
import {matrixFor} from './ci-matrix.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const job = yaml.parse(
  fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'),
).jobs['pr-a11y-specs'];
const step = name => job.steps.find(s => s.name === name);
const scratch = [];
afterAll(() => {
  for (const dir of scratch) fs.rmSync(dir, {recursive: true, force: true});
});

// One pull request's selection: 70 spec files (478 tests), at the recorded
// times then (a file with no recorded time at the median, 17.5 s). On one
// worker in one job it ran 432 tests and the job's fifteen minutes cut it.
const SELECTION_SECONDS = [
  3.6, 4.4, 12.6, 10.7, 37.9, 17.5, 17.5, 4, 17.5, 8.8, 59.2, 20, 28.8, 17.5,
  17.5, 17.5, 17.5, 3.1, 7.5, 4, 8.2, 17.5, 10.9, 62, 17.9, 17.5, 21.8, 17.5,
  11.9, 17.5, 4.9, 3.8, 17.5, 85.1, 133.3, 22.1, 13.5, 9, 35.8, 16, 17.5, 22.5,
  15.7, 17.5, 14.4, 24.5, 3.8, 2.2, 5.8, 2.6, 1.5, 15.4, 2.3, 38.2, 4, 325.2,
  1.7, 12.3, 17.5, 17.5, 0.2, 8.5, 4, 2.5, 46.7, 3, 17.5, 17.5, 5.6, 20.9,
];
const selection = SELECTION_SECONDS.map(
  (_, i) => `packages/core/src/S${String(i).padStart(2, '0')}.a11y.spec.ts`,
);
const seconds = Object.fromEntries(
  selection.map((file, i) => [file, SELECTION_SECONDS[i]]),
);
const sumMs = files => files.reduce((t, f) => t + seconds[f] * 1000, 0);

describe('the opt-in accessibility specs split into legs', () => {
  it('splits a selection that one job cannot finish into legs that each fit ten minutes', () => {
    expect(LEG_BUDGET_MS).toBe(10 * 60 * 1000);
    // In one job, the selection's recorded time is about 26 minutes.
    expect(sumMs(selection)).toBeGreaterThan(2 * LEG_BUDGET_MS);
    const {count, shares, longestMs} = planLegs(selection, seconds, 3);
    expect(count).toBe(3);
    expect(longestMs).toBeLessThanOrEqual(LEG_BUDGET_MS);
    for (const share of shares)
      expect(sumMs(share)).toBeLessThanOrEqual(LEG_BUDGET_MS);
    // Every file runs in exactly one leg.
    expect(shares.flat().sort()).toEqual([...selection].sort());
  });

  it('keeps a small selection in one leg, and never plans more legs than the matrix has', () => {
    expect(planLegs(selection.slice(0, 5), seconds, 3).count).toBe(1);
    expect(planLegs([], seconds, 3)).toMatchObject({count: 1, shares: [[]]});
    const all = planLegs(selection, seconds, 2);
    expect(all.count).toBe(2);
    expect(all.longestMs).toBeGreaterThan(LEG_BUDGET_MS);
  });

  it('puts the longest files first onto the leg with the least time, and lists each leg in path order', () => {
    const ms = {a: 4, b: 3, c: 2, d: 2, e: 1};
    expect(legShares(Object.keys(ms), file => ms[file], 2)).toEqual([
      ['a', 'd'],
      ['b', 'c', 'e'],
    ]);
  });
});

describe('the browser-specs job', () => {
  it('runs three legs for a pull request and one job for a release check', () => {
    expect(matrixFor(job.strategy.matrix.leg, 'pull_request')).toEqual([
      1, 2, 3,
    ]);
    expect(matrixFor(job.strategy.matrix.leg, 'workflow_dispatch')).toEqual([
      1,
    ]);
    expect(job.strategy['fail-fast']).toBe(false);
    // One parenthesized suffix, so status reports read the job as pr-a11y.
    expect(job.name).toBe(
      'pr-a11y (browser specs ${{ matrix.leg }}/${{ strategy.job-total }})',
    );
  });

  it('counts the legs before any install, and only a leg with a share installs and runs', () => {
    const names = job.steps.map(s => s.name);
    const count = step("Count this run's accessibility legs");
    expect(names.indexOf(count.name)).toBeLessThan(
      names.indexOf('Download Storybook artifact'),
    );
    expect(names.indexOf(count.name)).toBeLessThan(
      names.indexOf('Install Playwright'),
    );
    expect(count.run).toContain(
      'node "$runner" --count-legs ${{ strategy.job-total }} --leg ${{ matrix.leg }}',
    );
    expect(count.run).toContain('BASE_SHA=$(git rev-parse "$WORKFLOW_SHA^1")');
    for (const name of [
      'Download Storybook artifact',
      'Install Playwright',
      'Run browser accessibility specs',
      'Upload browser accessibility evidence',
    ]) {
      expect(step(name).if, name).toContain(
        "steps.legs.outputs.runs == 'true'",
      );
    }
    const run = step('Run browser accessibility specs');
    expect(run.run).toContain(
      'node "$runner" --leg ${{ steps.legs.outputs.leg }} --of ${{ steps.legs.outputs.count }}',
    );
    // One worker per leg: the recorded times assume one browser per core.
    expect(run.env.A11Y_CONTRACT_WORKERS).toBeUndefined();
    expect(step('Upload browser accessibility evidence').with.name).toBe(
      'pr-a11y-evidence-${{ needs.build-storybook.outputs.short_hash }}-${{ matrix.leg }}',
    );
  });

  it("writes the leg count and this leg's share for the steps after it", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a11y-legs-'));
    scratch.push(dir);
    const count = (legs, leg) => {
      const output = path.join(dir, `output-${legs}-${leg}`);
      const result = spawnSync(
        process.execPath,
        [
          path.join(root, '.github/scripts/a11y-pr-contracts.mjs'),
          '--count-legs',
          String(legs),
          '--leg',
          String(leg),
        ],
        {
          cwd: root,
          encoding: 'utf8',
          // Outside a pull request the count needs no pull request's files.
          env: {
            ...process.env,
            GITHUB_EVENT_NAME: 'workflow_dispatch',
            GITHUB_OUTPUT: output,
            WORKFLOW_SHA: '',
          },
        },
      );
      expect(result.status, result.stderr).toBe(0);
      return {
        stdout: result.stdout,
        output: Object.fromEntries(
          fs
            .readFileSync(output, 'utf8')
            .trim()
            .split('\n')
            .map(line => line.split('=')),
        ),
      };
    };
    // A leg runs only when the count reaches it.
    const third = count(3, 3);
    expect(third.output.leg).toBe('3');
    expect(['1', '2', '3']).toContain(third.output.count);
    expect(third.output.runs).toBe(String(Number(third.output.count) >= 3));
    expect(third.stdout).toMatch(/^Accessibility legs: \d for \d+ spec files/m);
    expect(count(1, 1).output).toEqual({count: '1', runs: 'true', leg: '1'});
  });
});
