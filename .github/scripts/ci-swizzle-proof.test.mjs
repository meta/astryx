// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ci-swizzle-proof.test.mjs
 * @input .github/workflows/ci.yml and the swizzle proof's slice files
 * @output Proof that the swizzle proof runs in its own required legs, one
 *   slice each, exactly when its scope proves a target, and never inside the
 *   Node legs
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
  it('runs one leg per slice file, each running its own file', () => {
    const job = ci.jobs['swizzle-proof'];
    expect(job.strategy.matrix.slice).toEqual(sliceFiles.map((_, i) => i + 1));
    expect(job.strategy['fail-fast']).toBe(false);
    const run = job.steps.find(
      step => step.name === 'Run this slice of the swizzle proof',
    ).run;
    expect(run).toBe(
      `pnpm test:node ${SLICES}/swizzle-proof.\${{ matrix.slice }}.test.mjs`,
    );
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
