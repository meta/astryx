// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file a11y-contract-shard-workflow.test.mjs
 * @input .github/workflows/a11y-contract-shard.yml and the release-check's
 *   a11y-contracts-shard job in .github/workflows/ci.yml
 * @output Proof that one contract leg runs at a commit on main exactly as the
 *   release-check runs it, refuses other inputs, and keeps its results
 * @position Node coverage for the single-leg dispatch used to bisect a
 *   contract failure on CI runners
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const read = file => yaml.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const workflow = read('.github/workflows/a11y-contract-shard.yml');
const ci = read('.github/workflows/ci.yml');
const job = workflow.jobs.shard;
const room = workflow.jobs.room;
const step = name =>
  [...room.steps, ...job.steps].find(item => item.name === name);
const releaseLeg = ci.jobs['a11y-contracts-shard'];
const releaseStep = releaseLeg.steps.find(
  item => item.name === 'Run accessibility spec-test contracts',
);

describe('the single contract-leg dispatch', () => {
  it('runs only on a dispatch, with read-only access', () => {
    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);
    expect(Object.keys(workflow.on.workflow_dispatch.inputs)).toEqual([
      'expected-head',
      'a11y-shard',
      'repeat',
    ]);
    expect(workflow.permissions).toEqual({});
    expect(job.permissions).toEqual({contents: 'read'});
    expect(room.permissions).toEqual({actions: 'read', contents: 'read'});
  });

  it('waits for room under the CI ceiling, yielding to a waiting main check or release re-check', () => {
    expect(job.needs).toEqual(['room']);
    // The inputs are checked before the wait.
    expect(room.steps[0].name).toBe('Check the inputs');
    const wait = step('Wait for room under the CI ceiling');
    expect(wait.uses).toBe('./.ci-admission/.github/actions/ci-admission');
    expect(wait.with).toEqual({
      phase: 'whole',
      peak: 2,
      main: 'false',
      'max-wait-minutes': 120,
      'max-looks': 30,
    });
    // The admission action comes from the dispatched ref (main), not the
    // commit under test.
    expect(step('Check out the admission action').with).toEqual({
      'sparse-checkout':
        '.github/actions/ci-admission\n.github/scripts/lib\nscripts/lib\n',
      path: '.ci-admission',
      'persist-credentials': false,
    });
    // The action turns away only a pull-request run; a dispatch starts after
    // its longest wait, so no step reads `full`.
    expect(JSON.stringify(workflow)).not.toContain('outputs.full');
    // A standard runner: the wait outlasts a slim job's fifteen minutes.
    expect(room['runs-on']).toBe('ubuntu-latest');
  });

  it('never puts an input into a script: each reaches it through the environment', () => {
    for (const item of [...room.steps, ...job.steps].filter(entry => entry.run))
      expect(item.run, item.name).not.toContain('${{');
  });

  it.each([
    ['a'.repeat(40), '5', '1', 0],
    ['0123456789abcdef0123456789abcdef01234567', '1', '10', 0],
    ['abc123', '5', '1', 1],
    ['a'.repeat(40) + '; echo x', '5', '1', 1],
    ['a'.repeat(40), '7', '1', 1],
    ['a'.repeat(40), '0', '1', 1],
    ['a'.repeat(40), '5', '11', 1],
    ['a'.repeat(40), '5', '-1', 1],
  ])(
    'checks the inputs (expected-head=%s, a11y-shard=%s, repeat=%s → exit %i)',
    (sha, shard, repeat, status) => {
      const result = spawnSync('bash', ['-c', step('Check the inputs').run], {
        encoding: 'utf8',
        env: {...process.env, SHA: sha, SHARD: shard, REPEAT: repeat},
      });
      expect(result.status, result.stdout + result.stderr).toBe(status);
    },
  );

  it('checks out the commit itself and refuses one that is not on main', () => {
    const checkout = step('Checkout');
    expect(checkout.uses).toMatch(/^actions\/checkout@/);
    expect(checkout.with).toMatchObject({
      ref: '${{ inputs.expected-head }}',
      'fetch-depth': 0,
      'persist-credentials': false,
    });
    const onMain = step('Require a commit on main');
    expect(onMain.run).toContain('test "$(git rev-parse HEAD)" = "$SHA"');
    expect(onMain.run).toContain(
      'git merge-base --is-ancestor "$SHA" origin/main',
    );
  });

  it('runs the leg as the release-check does, on a free runner of the same size', () => {
    const run = step('Run accessibility spec-test contracts');
    // ubuntu-latest has the four vCPUs and 16 GB of the release pool's
    // 4-core-ubuntu (ci-free-runners.test.mjs).
    expect(job['runs-on']).toBe('ubuntu-latest');
    expect(releaseLeg['runs-on']).toContain("'4-core-ubuntu'");
    expect(run.run).toContain(
      'node .github/scripts/a11y-contract-shard.mjs --shard "$SHARD/6" > contract-tests.txt',
    );
    expect(releaseStep.run).toContain(
      'node .github/scripts/a11y-contract-shard.mjs --shard "${{ matrix.shard }}/${{ strategy.job-total }}" > contract-tests.txt',
    );
    expect(releaseLeg.strategy.matrix.shard).toEqual([1, 2, 3, 4, 5, 6]);
    const release =
      'pnpm exec playwright test --test-list contract-tests.txt --config playwright.config.ts --project chromium';
    expect(releaseStep.run).toContain(release);
    expect(run.run).toContain(`${release} --repeat-each "$REPEAT"`);
    expect(run.env.A11Y_CONTRACT_WORKERS).toBe(
      releaseStep.env.A11Y_CONTRACT_WORKERS,
    );
    expect(run.env.ASTRYX_HEAD_SHA).toBe('${{ inputs.expected-head }}');
    // The Table timing receipt reports without gating, as off the release
    // runner path.
    expect(run.env.ASTRYX_TABLE_TIMING_GATE).toBe('0');
    expect(step('Build packages and Storybook').run).toBe(
      'node .github/scripts/build-packages-and-storybook.mjs',
    );
  });

  it('gives the leg time for its repeats, with no arithmetic, which expressions lack', () => {
    const limit = job['timeout-minutes'];
    expect(limit).not.toMatch(/[+*/]|\s-\s/);
    // Evaluated as Actions would: && and || return an operand.
    const minutes = repeat =>
      new Function(
        'inputs',
        'fromJSON',
        `return ${limit.replace(/^\$\{\{\s*|\s*\}\}$/g, '')};`,
      )({repeat: String(repeat)}, JSON.parse);
    // About 20 minutes of install and build, then about 12 a pass.
    for (let repeat = 1; repeat <= 10; repeat += 1)
      expect(minutes(repeat), `repeat ${repeat}`).toBeGreaterThanOrEqual(
        20 + 12.5 * repeat,
      );
    expect(minutes(10)).toBeLessThanOrEqual(360);
  });

  it("keeps the leg's Playwright results, passing or failing", () => {
    const keep = step("Keep the leg's Playwright results");
    expect(keep.if).toBe("always() && steps.contracts.outcome != 'skipped'");
    expect(keep.uses).toMatch(/^actions\/upload-artifact@/);
    expect(keep.with).toEqual({
      name: 'a11y-contract-shard-results-${{ inputs.expected-head }}-${{ inputs.a11y-shard }}-${{ github.run_attempt }}',
      path: 'test-results/\n*-audit-evidence/\n',
      'retention-days': 14,
      'if-no-files-found': 'ignore',
    });
  });
});
