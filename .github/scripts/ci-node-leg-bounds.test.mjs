// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A Node leg that runs long fails by name inside its job limit: the
 * shard watchdog fires a minute before the limit, the slowest hook's bound
 * ends first, and the recorded-times check reads the watchdog's times.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const job = yaml.parse(
  fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'),
).jobs['test-node'];
const step = job.steps.find(each => each.id === 'node-tests');
const limitMinutes = job['timeout-minutes'];

describe('the Node legs inside their job limit', () => {
  it('fire the shard watchdog a minute before the job limit, on every run of the shard', () => {
    expect(limitMinutes).toBe(15);
    expect(step.run).toContain(
      `VITEST_SHARD_WATCHDOG_SECONDS=$(( ${limitMinutes - 1} * 60 - \${started:-180} ))`,
    );
    expect(step.run).toContain(
      // Explicit reporters turn off Vitest's automatic github-actions
      // reporter, so the list names it to keep each failure's annotation.
      'WATCHDOG=(--reporter=default --reporter=github-actions --reporter=./scripts/vitest-shard-watchdog.mjs)',
    );
    // Both the scoped and the full run pass the watchdog.
    expect(
      step.run.match(/pnpm test:node [^\n]*"\$\{WATCHDOG\[@\]\}"/g),
    ).toHaveLength(2);
    expect(step.env.VITEST_SHARD_TIMES_FILE).toBe(
      '${{ runner.temp }}/node-file-times.json',
    );
  });

  it("check the changed files' recorded times from the watchdog's times, after the tests", () => {
    const names = job.steps.map(each => each.name);
    const check = job.steps.find(
      each =>
        each.name ===
        'Check the recorded times of the test files this change touches',
    );
    expect(names.indexOf(check.name)).toBeGreaterThan(names.indexOf(step.name));
    expect(check.if).toBe(
      "always() && github.event_name == 'pull_request' && steps.node-tests.outcome != 'skipped'",
    );
    expect(check.run).toBe(
      'node .github/scripts/node-time-drift.mjs --times "$RUNNER_TEMP/node-file-times.json" --changed HEAD^1',
    );
  });

  it("end door-conformance's slowest hook at least two minutes inside the job limit", () => {
    const source = fs.readFileSync(
      path.join(root, 'packages/cli/host/door-conformance.test.mjs'),
      'utf8',
    );
    const bound =
      /beforeAll\(async \(\) => \{[\s\S]*?\n {2}\}, (\d+) \* 60_000\);/.exec(
        source,
      );
    expect(bound, 'the beforeAll bound').not.toBeNull();
    expect(Number(bound[1])).toBeLessThanOrEqual(limitMinutes - 2);
  });

  it('run no browser step: the browser contracts have a job of their own', () => {
    // A step only one leg runs takes a share of that leg no split can book.
    // The first leg keeps only the steps that run where no Node share runs (a
    // spec-only change's record readers) or a Lab-only change's one check.
    const legOneOnly = job.steps
      .filter(
        each =>
          typeof each.if === 'string' && /\bmatrix\.shard == 1\b/.test(each.if),
      )
      .map(each => each.name);
    expect(legOneOnly.sort()).toEqual([
      'Check out the change for the tests that read its records',
      'Lab-only: CLI official-packages check',
      'List the tests that read a changed record',
    ]);
    expect(
      job.steps.some(each => /playwright/i.test(String(each.run ?? ''))),
    ).toBe(false);
    const browser = yaml.parse(
      fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'),
    ).jobs['node-browser-contracts'];
    expect(browser.steps.map(each => each.name)).toEqual(
      expect.arrayContaining([
        'Install Playwright for theme-family contract',
        'Offline-media browser cases',
        'Theme editor browser case',
        'Run the theme-family contract',
      ]),
    );
    expect(step.env.VITEST_LEG_ONE_RESERVE).toBeUndefined();
  });
});
