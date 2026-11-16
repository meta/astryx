// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ci-swizzle-proof.test.mjs
 * @input .github/workflows/ci.yml and the swizzle proof's slice files
 * @output Proof that the swizzle proof runs in its own required legs, one
 *   slice each under the Node legs' shard watchdog, exactly when its scope
 *   proves a target, and never inside the Node legs
 * @position Beside the other ci.yml shape tests
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const ci = yaml.parse(
  fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8'),
);
const SLICES = 'packages/cli/test/swizzle-proof';
const sliceFiles = fs
  .readdirSync(path.join(ROOT, SLICES))
  .filter(file => /^swizzle-proof\.\d+\.test\.mjs$/.test(file));

describe('the swizzle proof in CI', () => {
  /** The slice files leg `leg` runs, read from its command line. */
  function filesOfLeg(leg) {
    const step = ci.jobs['swizzle-proof'].steps.find(
      each => each.name === "Run this leg's slices of the swizzle proof",
    );
    const command = step.run
      .split('\n')
      .find(line => line.trim().startsWith('pnpm test:node'));
    // The shell's arithmetic, with the matrix value in LEG.
    return [
      ...command.matchAll(/swizzle-proof\.\$\(\(([^)]*)\)\)\.test\.mjs/g),
    ].map(
      ([, expression]) =>
        `swizzle-proof.${Function('LEG', `return ${expression}`)(leg)}.test.mjs`,
    );
  }

  it('runs every slice file in exactly one leg, two slices to a leg', () => {
    const job = ci.jobs['swizzle-proof'];
    const legs = job.strategy.matrix.leg;
    expect(legs).toEqual(
      Array.from({length: sliceFiles.length / 2}, (_, i) => i + 1),
    );
    expect(job.strategy['fail-fast']).toBe(false);
    const step = job.steps.find(
      each => each.name === "Run this leg's slices of the swizzle proof",
    );
    expect(step.env.LEG).toBe('${{ matrix.leg }}');
    const run = legs.flatMap(filesOfLeg);
    expect(legs.map(leg => filesOfLeg(leg).length)).toEqual(legs.map(() => 2));
    expect([...run].sort()).toEqual([...sliceFiles].sort());
    expect(new Set(run).size).toBe(sliceFiles.length);
    expect(job.name).toBe(
      'swizzle-proof (${{ matrix.leg }}/${{ strategy.job-total }})',
    );
    // Its own job runs the slices: never the setting that leaves them out.
    expect(step.env?.VITEST_SWIZZLE_PROOF_OWN_JOB).toBeUndefined();
  });

  it('holds a pair of slices inside the leg limit at their largest recorded time', () => {
    const {seconds} = JSON.parse(
      fs.readFileSync(
        path.join(ROOT, 'scripts/vitest-node-durations.json'),
        'utf8',
      ),
    );
    // Two slices run side by side in a leg; setup takes about two minutes.
    const setupS = 120;
    const limitS = 14 * 60;
    for (const leg of ci.jobs['swizzle-proof'].strategy.matrix.leg) {
      const slowest = Math.max(
        ...filesOfLeg(leg).map(file => seconds[`${SLICES}/${file}`] ?? 0),
      );
      expect(slowest + setupS).toBeLessThan(limitS);
    }
  });

  it("tells admission the legs' full width", () => {
    const plan = Object.values(ci.jobs)
      .flatMap(job => job.steps ?? [])
      .find(each => each.name === 'Plan the Node legs');
    const widths = JSON.parse(/--other-widths '([^']*)'/.exec(plan.run)[1]);
    expect(widths['swizzle-proof'].full).toBe(
      ci.jobs['swizzle-proof'].strategy.matrix.leg.length,
    );
  });

  it('runs each slice under the shard watchdog, as the Node legs do, and checks its recorded time', () => {
    const slice = ci.jobs['swizzle-proof'].steps.find(
      step => step.name === "Run this leg's slices of the swizzle proof",
    );
    const node = ci.jobs['test-node'].steps.find(
      step => step.name === 'Run this shard of the Node tests',
    );
    // The same limit, counted the same way, and the same reporters.
    for (const line of node.run
      .split('\n')
      .filter(line =>
        /^(started=|VITEST_SHARD_WATCHDOG_SECONDS=|export |WATCHDOG=)/.test(
          line.trim(),
        ),
      ))
      expect(slice.run).toContain(line.trim());
    expect(ci.jobs['swizzle-proof']['timeout-minutes']).toBe(
      ci.jobs['test-node']['timeout-minutes'],
    );
    expect(slice.env.VITEST_SHARD_TIMES_FILE).toBe(
      node.env.VITEST_SHARD_TIMES_FILE,
    );
    const drift = ci.jobs['swizzle-proof'].steps.find(
      step => step.name === "Check the recorded time of this leg's slices",
    );
    expect(drift.run).toBe(
      'node .github/scripts/node-time-drift.mjs --times "$RUNNER_TEMP/node-file-times.json" --changed HEAD^1',
    );
    expect(drift.if).toContain("steps.slice.outcome != 'skipped'");
  });

  it('starts the legs exactly when the scope proves a target', () => {
    const job = ci.jobs['swizzle-proof'];
    expect(job.needs).toContain('swizzle-proof-scope');
    expect(job.if).toContain(
      "(needs.swizzle-proof-scope.outputs.mode == 'affected' || needs.swizzle-proof-scope.outputs.mode == 'all')",
    );
    const scope = ci.jobs['swizzle-proof-scope'];
    expect(scope.outputs.mode).toBe('${{ steps.proof.outputs.mode }}');
    const decide = scope.steps.find(step => step.id === 'proof');
    expect(decide.run).toContain(
      'node packages/cli/test/swizzle-proof/scope.mjs',
    );
    // Read before anything is installed: the scope job sets nothing up.
    expect(
      scope.steps.some(step => step.uses === './.github/actions/setup'),
    ).toBe(false);
  });

  it('is required by the test join, with the legs checked against the scope', () => {
    expect(ci.jobs.test.needs).toEqual(
      expect.arrayContaining(['swizzle-proof-scope', 'swizzle-proof']),
    );
    const join = ci.jobs.test.steps.find(
      step => step.name === 'Require expected test-owner outcomes',
    );
    expect(join.env).toMatchObject({
      SWIZZLE_PROOF_SCOPE_RESULT: '${{ needs.swizzle-proof-scope.result }}',
      SWIZZLE_PROOF_MODE: '${{ needs.swizzle-proof-scope.outputs.mode }}',
      SWIZZLE_PROOF_RESULT: '${{ needs.swizzle-proof.result }}',
    });
  });

  it('keeps the slices out of the Node legs', () => {
    const node = ci.jobs['test-node'].steps.find(
      step => step.name === 'Run this shard of the Node tests',
    );
    expect(node.env.VITEST_SWIZZLE_PROOF_OWN_JOB).toBe('1');
    // The Node project leaves the slices out under that switch, and keeps
    // them otherwise (a local run, Main's release re-check).
    const slicesListed = own =>
      execFileSync(
        process.execPath,
        [
          path.join(ROOT, 'node_modules/vitest/vitest.mjs'),
          'list',
          '--project',
          'node',
          '--filesOnly',
          SLICES,
        ],
        {
          cwd: ROOT,
          encoding: 'utf8',
          env: {...process.env, VITEST_SWIZZLE_PROOF_OWN_JOB: own},
        },
      )
        .split('\n')
        .filter(line => /swizzle-proof\.\d+\.test\.mjs/.test(line));
    expect(slicesListed('1')).toEqual([]);
    expect(slicesListed('')).toHaveLength(sliceFiles.length);
  }, 120_000);
});
