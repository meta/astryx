// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract: a pull request's opt-in accessibility specs run in legs.
 *
 * The browser-specs job runs its selection on one worker, and the files'
 * recorded times assume one browser per core, so more workers on one runner
 * only stretch each file. The job instead splits the selection into up to
 * three legs by recorded time, each about ten minutes or less, inside the
 * job's fifteen minutes. A leg the selection does not need stops after its
 * count step, after the Storybook download (a changed multi-component folder
 * resolves its components through its story index) and before the Chromium
 * install.
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {afterAll, describe, expect, it} from 'vitest';
import yaml from 'yaml';

import {LEG_BUDGET_MS, planLegs} from './a11y-pr-contracts.mjs';
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

  it('splits slowest first onto the leg with the least time, as the other leg planners do', () => {
    const ms = {a: 400, b: 300, c: 200, d: 200, e: 100};
    expect(planLegs(Object.keys(ms), ms, 2).shares).toEqual([
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

  it('counts the legs after the Storybook download and before the Chromium install, and only a leg with a share runs its share', () => {
    const names = job.steps.map(s => s.name);
    const count = step("Count this run's accessibility legs");
    // A pull request that changes a multi-component folder resolves its
    // components through the built Storybook's story index, so every leg
    // downloads it before counting.
    const download = step('Download Storybook artifact');
    expect(names.indexOf(download.name)).toBeLessThan(
      names.indexOf(count.name),
    );
    expect(download.if).toBe(count.if);
    expect(names.indexOf(count.name)).toBeLessThan(
      names.indexOf('Install Playwright'),
    );
    expect(count.run).toContain(
      'node "$runner" --count-legs ${{ strategy.job-total }} --leg ${{ matrix.leg }} --share-out "$RUNNER_TEMP/a11y-leg-share.json"',
    );
    // The runner imports the shared duration split, so it is copied beside it.
    expect(count.run).toContain(
      'git show "$WORKFLOW_SHA:scripts/lib/duration-split.mjs" > "$RUNNER_TEMP/a11y/scripts/lib/duration-split.mjs"',
    );
    expect(count.run).toContain('BASE_SHA=$(git rev-parse "$WORKFLOW_SHA^1")');
    for (const name of [
      'Install Playwright',
      'Run browser accessibility specs',
      'Upload browser accessibility evidence',
    ]) {
      expect(step(name).if, name).toContain(
        "steps.legs.outputs.runs == 'true'",
      );
    }
    const run = step('Run browser accessibility specs');
    // The run step runs the share the count step wrote, never a selection
    // of its own.
    expect(run.run).toContain(
      'node "$runner" --share "$RUNNER_TEMP/a11y-leg-share.json" --leg ${{ steps.legs.outputs.leg }} --of ${{ steps.legs.outputs.count }}',
    );
    // One worker per leg: the recorded times assume one browser per core.
    expect(run.env.A11Y_CONTRACT_WORKERS).toBeUndefined();
    expect(step('Upload browser accessibility evidence').with.name).toBe(
      'pr-a11y-evidence-${{ needs.build-storybook.outputs.short_hash }}-${{ matrix.leg }}',
    );
  });

  // Each count lists every spec through Playwright, a few seconds apiece.
  it("writes the leg count and this leg's share for the steps after it", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a11y-legs-'));
    scratch.push(dir);
    const count = (legs, leg, env = {}) => {
      const output = path.join(dir, `output-${legs}-${leg}`);
      const result = spawnSync(
        process.execPath,
        [
          path.join(root, '.github/scripts/a11y-pr-contracts.mjs'),
          '--count-legs',
          String(legs),
          '--leg',
          String(leg),
          '--share-out',
          path.join(dir, `share-${legs}-${leg}.json`),
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
            BASE_SHA: '',
            ...env,
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
    // A leg that cannot list the pull request's files runs the whole
    // selection as the only leg, so no planned file is left out.
    const lost = count(3, 2, {
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_ACTIONS: 'true',
    });
    expect(lost.output).toEqual({count: '1', runs: 'true', leg: '1'});
    expect(lost.stdout).toContain(
      '::warning title=Accessibility scope unknown::',
    );
    const lostShare = JSON.parse(
      fs.readFileSync(path.join(dir, 'share-3-2.json'), 'utf8'),
    );
    expect(lostShare.scopeKnown).toBe(false);
    expect(lostShare.run.length).toBeGreaterThan(0);
    const one = count(1, 1);
    expect(one.output).toEqual({count: '1', runs: 'true', leg: '1'});
    // One leg's share is the whole selection, each file with its reason.
    const share = JSON.parse(
      fs.readFileSync(path.join(dir, 'share-1-1.json'), 'utf8'),
    );
    expect(share.scopeKnown).toBe(true);
    expect(share.run.length).toBeGreaterThan(0);
    for (const entry of share.run)
      expect(Object.keys(entry).sort()).toEqual(['file', 'reason']);
  }, 180_000);
});
