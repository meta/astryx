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

  it("give the first leg's own steps their recorded time in the split, every one of them", () => {
    const record = JSON.parse(
      fs.readFileSync(
        path.join(root, 'scripts/vitest-node-durations.json'),
        'utf8',
      ),
    );
    const legOneOnly = job.steps
      .filter(
        each =>
          typeof each.if === 'string' && /\bmatrix\.shard == 1\b/.test(each.if),
      )
      .map(each => each.name)
      .sort();
    // A step only the first leg runs needs a recorded time, or the split
    // does not leave the leg room for it.
    expect(Object.keys(record.legOneSteps).sort()).toEqual(legOneOnly);
    for (const seconds of Object.values(record.legOneSteps))
      expect(Number.isFinite(seconds) && seconds >= 0).toBe(true);
    // Only where those steps run, the same value on every leg.
    expect(step.env.VITEST_LEG_ONE_RESERVE).toBe(
      "${{ steps.scope.outputs.docsite_only != 'true' && steps.scope.outputs.spec_only != 'true' && steps.scope.outputs.tooling_only != 'true' && '1' || '0' }}",
    );
    expect(step.env.VITEST_LEG_ONE_RESERVE).not.toMatch(/matrix\.shard/);
  });
});
