// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract: a pull request that adds or changes a release spec
 *   (`*.release.*.spec.ts`) runs exactly those specs in `release-specs
 *   (changed)`, with the runner, workers and config of the release check's
 *   spec-test contracts, and every other pull request skips the job.
 * @position Node contract for spec:AST-030 FR26 and FR31 (a changed spec
 *   always runs).
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

import {isA11ySpecFile} from './lib/a11y-spec-files.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const ci = yaml.parse(
  fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'),
);
const job = ci.jobs['release-specs'];
const contracts = ci.jobs['a11y-contracts-shard'];
const step = name => job.steps.find(each => each.name === name);
const scope = job.steps.find(each => each.id === 'scope');

/** Runs the job's spec-finding step on a changed-file list. */
function findSpecs(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-specs-'));
  const changed = path.join(dir, 'changed.txt');
  const output = path.join(dir, 'output');
  fs.writeFileSync(changed, files.map(file => `${file}\n`).join(''));
  fs.writeFileSync(output, '');
  const result = spawnSync(
    'bash',
    ['-e', '-c', step('Find the changed release specs').run],
    {
      env: {
        ...process.env,
        FILES_PATH: changed,
        GITHUB_OUTPUT: output,
        RUNNER_TEMP: dir,
      },
      encoding: 'utf8',
    },
  );
  const outputs = Object.fromEntries(
    fs
      .readFileSync(output, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => line.split('=')),
  );
  return {
    status: result.status,
    hasSpecs: outputs.has_specs,
    specs: outputs.path
      ? fs.readFileSync(outputs.path, 'utf8').split('\n').filter(Boolean)
      : [],
  };
}

describe('release-specs (changed)', () => {
  it('is a job of its own, under the name merge-guard waits for', () => {
    expect(job.name).toBe('release-specs (changed)');
  });

  it('runs on a pull request behind the same gate as the other contract jobs', () => {
    expect(job.if).toBe(ci.jobs['pr-component-a11y-contracts'].if);
    expect(job.needs).toEqual([
      'room',
      'admission',
      'heavy-ci',
      'build-storybook',
    ]);
    expect(scope.with['outside-pull-request']).toBe('skip');
  });

  it("uses the gating release check's runner, workers and config", () => {
    // The release check runs its contracts on 4-core-ubuntu when a person or
    // the release tooling dispatches it.
    expect(contracts['runs-on']).toContain("'4-core-ubuntu'");
    expect(job['runs-on']).toBe('4-core-ubuntu');
    const run = step('Run the changed release specs');
    const release = contracts.steps.find(
      each => each.name === 'Run accessibility spec-test contracts',
    );
    expect(run.env.A11Y_CONTRACT_WORKERS).toBe(
      release.env.A11Y_CONTRACT_WORKERS,
    );
    expect(run.run).toContain(
      '--config playwright.config.ts --project chromium',
    );
    expect(release.run).toContain(
      '--config playwright.config.ts --project chromium',
    );
  });

  it('is scoped to release spec paths', () => {
    const paths = new RegExp(scope.with.paths);
    expect(
      paths.test(
        'packages/core/src/Table/__tests__/TableVirtualization.release.a11y.chromium.spec.ts',
      ),
    ).toBe(true);
    for (const file of [
      'packages/core/src/Table/Table.tsx',
      'packages/core/src/Table/__tests__/TableFocusRing.a11y.chromium.spec.ts',
      'docs/release.md',
    ])
      expect(paths.test(file), file).toBe(false);
  });

  it('runs exactly the changed release specs', () => {
    const spec =
      'packages/core/src/Table/__tests__/TableVirtualization.release.a11y.chromium.spec.ts';
    expect(
      findSpecs([
        spec,
        'packages/core/src/Table/Table.tsx',
        'packages/core/src/Table/__tests__/TableFocusRing.a11y.chromium.spec.ts',
      ]),
    ).toEqual({status: 0, hasSpecs: 'true', specs: [spec]});
  });

  it('skips a pull request that changes no release spec', () => {
    expect(findSpecs(['packages/core/src/Table/Table.tsx'])).toEqual({
      status: 0,
      hasSpecs: 'false',
      specs: [],
    });
    const skip = step('Skip when no release spec changed');
    expect(skip.if).toBe(
      "steps.scope.outputs.applies != 'true' || steps.specs.outputs.has_specs != 'true'",
    );
    for (const each of job.steps.slice(job.steps.indexOf(skip) + 1))
      expect(each.if, each.name).toContain(
        "steps.specs.outputs.has_specs == 'true'",
      );
  });

  it('fails when the changed files are unknown', () => {
    const result = spawnSync(
      'bash',
      ['-e', '-c', step('Find the changed release specs').run],
      {
        env: {
          ...process.env,
          FILES_PATH: '',
          GITHUB_OUTPUT: '/dev/null',
          RUNNER_TEMP: os.tmpdir(),
        },
        encoding: 'utf8',
      },
    );
    expect(result.status).toBe(1);
  });

  it('fails a release spec the release check would not run', () => {
    const run = step('Run the changed release specs').run;
    expect(run).toContain('isA11ySpecFile');
    // The globs come from the workflow's commit, as the config the release
    // check runs does.
    expect(run).toContain(
      '$RUNNER_TEMP/release-specs/.github/scripts/lib/a11y-spec-files.mjs',
    );
    // Today's release spec is inside the config's globs.
    expect(
      isA11ySpecFile(
        'packages/core/src/Table/__tests__/TableVirtualization.release.a11y.chromium.spec.ts',
      ),
    ).toBe(true);
    expect(
      isA11ySpecFile('packages/core/src/Table/__tests__/Table.release.spec.ts'),
    ).toBe(false);
  });

  it('has no time budget of its own: a failing spec fails the job', () => {
    const run = step('Run the changed release specs');
    expect(run['continue-on-error']).toBeUndefined();
    expect(run.run).toContain('set -euo pipefail');
    expect(run.run).toContain('pnpm exec playwright test "${SPECS[@]}"');
  });
});
