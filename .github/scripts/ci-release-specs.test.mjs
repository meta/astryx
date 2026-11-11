// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract: a pull request that adds or changes a release spec
 *   (`*.release.*.spec.ts`), or a module such a spec imports, runs those specs
 *   in full in `release-specs (changed)`: alone, on the release check's
 *   runner, with its config and timing gate. Every other pull request plans
 *   nothing on a slim runner and never starts the job.
 * @position Node contract for spec:AST-030 FR32's release-file and import
 *   triggers.
 */

import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const ci = yaml.parse(
  fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'),
);
const plan = ci.jobs['release-specs-plan'];
const job = ci.jobs['release-specs'];
const join = ci.jobs['release-specs-changed'];
const contracts = ci.jobs['a11y-contracts-shard'];
const stepOf = (owner, name) => owner.steps.find(each => each.name === name);
const run = stepOf(job, 'Run the planned release specs');
const GATE = ci.jobs['pr-component-a11y-contracts'].if;
const TODAY =
  'packages/core/src/Table/__tests__/TableVirtualization.release.a11y.chromium.spec.ts';

/**
 * Runs the job's run step in a scratch checkout holding `files`, with a
 * `pnpm` that records its arguments instead of running Playwright.
 */
function runStep(specs, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-specs-'));
  const temp = path.join(dir, 'temp');
  const lib = path.join(temp, 'release-specs/.github/scripts/lib');
  fs.mkdirSync(lib, {recursive: true});
  fs.copyFileSync(
    path.join(root, '.github/scripts/lib/a11y-spec-files.mjs'),
    path.join(lib, 'a11y-spec-files.mjs'),
  );
  for (const file of files) {
    fs.mkdirSync(path.join(dir, path.dirname(file)), {recursive: true});
    fs.writeFileSync(path.join(dir, file), '');
  }
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(
    path.join(bin, 'pnpm'),
    `#!/bin/sh\necho "$@" > "${path.join(dir, 'pnpm-args')}"\n`,
    {mode: 0o755},
  );
  const result = spawnSync('bash', ['-e', '-c', run.run], {
    cwd: dir,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      RUNNER_TEMP: temp,
      SPECS: JSON.stringify(specs),
    },
    encoding: 'utf8',
  });
  const argsFile = path.join(dir, 'pnpm-args');
  return {
    status: result.status,
    stdout: result.stdout,
    pnpm: fs.existsSync(argsFile)
      ? fs.readFileSync(argsFile, 'utf8').trim()
      : null,
  };
}

describe('release-specs (changed)', () => {
  it('joins its shards under the name merge-guard waits for', () => {
    expect(join.name).toBe('release-specs (changed)');
    expect(job.name).toBe(
      'release-specs (shard ${{ matrix.shard }}/${{ matrix.of }})',
    );
    expect(join['runs-on']).toBe('ubuntu-slim');
    expect(join.needs).toEqual([
      'room',
      'admission',
      'heavy-ci',
      'release-specs-plan',
      'release-specs',
    ]);
    // It starts exactly when the shards do, and it starts after a failed
    // shard too: the gate holds always().
    expect(join.if).toBe(job.if);
    expect(join.if).toContain('always()');
    const step = join.steps.at(-1);
    for (const [result, status] of [
      ['success', 0],
      ['failure', 1],
      ['cancelled', 1],
      ['skipped', 1],
    ])
      expect(
        spawnSync('bash', ['-e', '-c', step.run], {
          env: {...process.env, SHARDS: result},
        }).status,
        result,
      ).toBe(status);
    expect(step.env.SHARDS).toBe('${{ needs.release-specs.result }}');
  });

  it('runs each shard the plan names, all of them even when one fails', () => {
    expect(plan.outputs.shards).toBe('${{ steps.plan.outputs.shards }}');
    expect(job.strategy['fail-fast']).toBe(false);
    expect(job.strategy.matrix.include).toBe(
      '${{ fromJSON(needs.release-specs-plan.outputs.shards) }}',
    );
    expect(job['timeout-minutes']).toBe(15);
  });

  it('plans a Lab-only pull request from its changed files', () => {
    const scope = plan.steps.find(each => each.id === 'scope');
    expect(scope.with['lab-only-specs']).toBe('.');
    expect(stepOf(plan, 'Plan the release specs').env.FILES_PATH).toBe(
      '${{ steps.scope.outputs.changed_files_path || steps.scope.outputs.lab_specs_path }}',
    );
    expect(stepOf(plan, 'Require a complete changed-file list').if).toBe(
      "steps.scope.outputs.applies == 'true' && steps.scope.outputs.changed_files_path == '' && steps.scope.outputs.lab_specs_path == ''",
    );
  });

  it('plans on a slim runner, behind the same gate as the other contract jobs', () => {
    expect(plan['runs-on']).toBe('ubuntu-slim');
    expect(plan.if).toBe(GATE);
    expect(plan.needs).toEqual(['room', 'admission', 'heavy-ci']);
    const scope = plan.steps.find(each => each.id === 'scope');
    expect(scope.with['outside-pull-request']).toBe('skip');
    expect(scope.with['component-audit']).toBe('true');
  });

  it('starts the release check runner only when the plan names a spec', () => {
    expect(job.needs).toEqual([
      'room',
      'admission',
      'heavy-ci',
      'build-storybook',
      'release-specs-plan',
    ]);
    // The plan's answer joins the admission condition inside the gate.
    expect(GATE.endsWith("needs.admission.outputs.full != 'true')) }}")).toBe(
      true,
    );
    expect(job.if).toBe(
      GATE.replace(
        /\)\) \}\}$/,
        " && needs.release-specs-plan.outputs.has_specs == 'true')) }}",
      ),
    );
    expect(plan.outputs.has_specs).toBe('${{ steps.plan.outputs.has_specs }}');
    expect(run.env.SPECS).toBe('${{ toJSON(matrix.specs) }}');
  });

  it('plans from the package and harness sources and the release specs', () => {
    const scope = plan.steps.find(each => each.id === 'scope');
    const paths = new RegExp(scope.with.paths);
    for (const file of [
      TODAY,
      'packages/core/src/Table/Table.tsx',
      'internal/interaction-harness/src/frames.ts',
    ])
      expect(paths.test(file), file).toBe(true);
    for (const file of ['docs/release.md', 'apps/docsite/src/page.tsx'])
      expect(paths.test(file), file).toBe(false);
    expect(stepOf(plan, 'Plan the release specs').run).toContain(
      'release-specs-plan.mjs',
    );
  });

  it("starts the planner from only the plan job's sparse checkout", () => {
    const checkout = plan.steps.find(
      each => each.name === "Check out the merge commit's sources",
    );
    const sparse = checkout.with['sparse-checkout'].trim().split('\n');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-plan-'));
    const copy = path.join(dir, '.plan');
    // The scripts, visit map and recorded times the job checks out; the
    // planner reads no others.
    expect(sparse).toEqual(
      expect.arrayContaining([
        '.github',
        'scripts/lib',
        'apps/storybook/stories',
      ]),
    );
    for (const file of [
      '.github/scripts',
      '.github/release-spec-visits.json',
      '.github/a11y-contract-durations.json',
      'scripts/lib',
    ]) {
      expect(
        sparse.some(each => file === each || file.startsWith(`${each}/`)),
        file,
      ).toBe(true);
      fs.cpSync(path.join(root, file), path.join(copy, file), {
        recursive: true,
      });
    }
    const spec =
      'packages/core/src/Table/__tests__/Table.release.a11y.chromium.spec.ts';
    fs.mkdirSync(path.join(copy, path.dirname(spec)), {recursive: true});
    fs.writeFileSync(path.join(copy, spec), '\n');
    fs.writeFileSync(path.join(dir, 'listed.txt'), `${spec}\n`);
    fs.writeFileSync(path.join(dir, 'changed.txt'), `${spec}\n`);
    const out = execFileSync(
      'node',
      [
        path.join(copy, '.github/scripts/release-specs-plan.mjs'),
        '--listed',
        path.join(dir, 'listed.txt'),
        '--changed',
        path.join(dir, 'changed.txt'),
        '--root',
        copy,
        '--out',
        path.join(dir, 'plan.json'),
      ],
      {encoding: 'utf8', env: {...process.env, GITHUB_OUTPUT: ''}},
    );
    expect(out).toContain(spec);
    expect(
      JSON.parse(fs.readFileSync(path.join(dir, 'plan.json'), 'utf8')).specs,
    ).toEqual([spec]);
  });

  it("uses the gating release check's runner, config and timing gate, on one worker", () => {
    // The release check runs its contracts on 4-core-ubuntu when a person or
    // the release tooling dispatches it.
    expect(contracts['runs-on']).toContain("'4-core-ubuntu'");
    expect(job['runs-on']).toBe('4-core-ubuntu');
    expect(run.env.ASTRYX_TABLE_TIMING_GATE).toBe('1');
    expect(run.env.A11Y_CONTRACT_WORKERS).toBeUndefined();
    const release = contracts.steps.find(
      each => each.name === 'Run accessibility spec-test contracts',
    );
    expect(release.run).toContain(
      '--config playwright.config.ts --project chromium',
    );
    expect(runStep([TODAY], [TODAY])).toEqual({
      status: 0,
      stdout: expect.any(String),
      pnpm: `exec playwright test ${TODAY} --config playwright.config.ts --project chromium --workers=1`,
    });
  });

  it('fails a planned release spec that no release check would run', () => {
    const outside = 'packages/core/src/Table/__tests__/Table.release.spec.ts';
    const result = runStep([TODAY, outside], [TODAY, outside]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`::error file=${outside}::`);
    expect(result.pnpm).toBeNull();
  });

  it('fails, naming it, a planned spec the head lacks, never dropping it', () => {
    // The plan reads the merge commit, so a planned spec that the head lacks
    // was added on main after the branch point.
    const result = runStep([TODAY], []);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`::error file=${TODAY}::`);
    expect(result.stdout).toContain('Merge main into the branch');
    expect(result.pnpm).toBeNull();
  });

  it('has no time budget and no retry: a failing spec fails the job', () => {
    expect(run['continue-on-error']).toBeUndefined();
    expect(run['timeout-minutes']).toBeUndefined();
    expect(run.run).toContain('set -euo pipefail');
    expect(run.run).not.toContain('--retries');
  });

  it('fails the plan when the planner fails, never planning nothing', () => {
    const step = stepOf(plan, 'Plan the release specs');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-plan-fail-'));
    execFileSync('git', ['init', '-q', path.join(dir, '.plan')]);
    const bin = path.join(dir, 'bin');
    fs.mkdirSync(bin);
    // A planner that throws.
    fs.writeFileSync(path.join(bin, 'node'), '#!/bin/sh\nexit 1\n', {
      mode: 0o755,
    });
    const result = spawnSync('bash', ['-e', '-c', step.run], {
      cwd: dir,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        RUNNER_TEMP: dir,
        FILES_PATH: path.join(dir, 'changed.txt'),
        GITHUB_STEP_SUMMARY: path.join(dir, 'summary'),
      },
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
  });

  it('says to split a pull request whose file list GitHub truncated', () => {
    const check = stepOf(plan, 'Require a complete changed-file list');
    const status = truncated =>
      spawnSync('bash', ['-e', '-c', check.run], {
        env: {...process.env, TRUNCATED: truncated},
        encoding: 'utf8',
      });
    const split = status('true');
    expect(split.status).toBe(1);
    expect(split.stdout).toContain('Split the pull request.');
    const other = status('false');
    expect(other.status).toBe(1);
    expect(other.stdout).toContain('Re-run the job.');
  });
});
