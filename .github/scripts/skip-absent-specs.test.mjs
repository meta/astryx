// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file skip-absent-specs.test.mjs
 *
 * The wrapper pr-a11y sources into its steps so that a contract step added on
 * main does not fail an older PR head that lacks the step's spec file. Each
 * case runs a step script the way the job does (`bash -e`, the wrapper in
 * BASH_ENV) against a stand-in pnpm that records what it was asked to run.
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

const WRAPPER = path.join(import.meta.dirname, 'skip-absent-specs.sh');
const PRESENT = 'specs/Present.a11y.chromium.spec.ts';
const ABSENT = 'specs/Absent.a11y.chromium.spec.ts';

describe('skip-absent-specs.sh', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-skip-absent-specs-'));
    fs.mkdirSync(path.join(dir, 'bin'));
    fs.writeFileSync(
      path.join(dir, 'bin', 'pnpm'),
      '#!/usr/bin/env bash\necho "$*" >> "$PNPM_LOG"\nexit "${PNPM_EXIT:-0}"\n',
      {mode: 0o755},
    );
    fs.mkdirSync(path.join(dir, 'specs'));
    fs.writeFileSync(path.join(dir, PRESENT), '');
  });

  afterEach(() => {
    fs.rmSync(dir, {recursive: true, force: true});
  });

  function step(script, env = {}) {
    const file = path.join(dir, 'step.sh');
    const log = path.join(dir, 'pnpm.log');
    fs.writeFileSync(file, script);
    const result = spawnSync('bash', ['-e', file], {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        BASH_ENV: WRAPPER,
        PATH: `${path.join(dir, 'bin')}${path.delimiter}${process.env.PATH}`,
        PNPM_LOG: log,
        ...env,
      },
    });
    const calls = fs.existsSync(log)
      ? fs.readFileSync(log, 'utf8').trim().split('\n')
      : [];
    return {status: result.status, stdout: result.stdout, calls};
  }

  it('runs a step whose spec files are all present unchanged', () => {
    const {status, stdout, calls} = step(
      `pnpm exec playwright test \\\n  ${PRESENT} \\\n  --project chromium \\\n  --output out\n`,
    );
    expect(status).toBe(0);
    expect(calls).toEqual([
      `exec playwright test ${PRESENT} --project chromium --output out`,
    ]);
    expect(stdout).not.toContain('::notice');
  });

  it('drops a spec file the head lacks, with a notice, and runs the rest', () => {
    const {status, stdout, calls} = step(
      `pnpm exec playwright test ${ABSENT} ${PRESENT} --project chromium --reporter list,json --output out\n`,
    );
    expect(status).toBe(0);
    expect(calls).toEqual([
      `exec playwright test ${PRESENT} --project chromium --reporter list,json --output out`,
    ]);
    expect(stdout).toContain(
      `::notice title=Spec not in this PR head::${ABSENT} is not in this pull request's head; rebase onto main to run it.`,
    );
  });

  it('passes a step whose spec files are all absent without running Playwright', () => {
    const {status, stdout, calls} = step(
      `pnpm exec playwright test ${ABSENT} --project chromium --output out\necho after\n`,
    );
    expect(status).toBe(0);
    expect(calls).toEqual([]);
    expect(stdout).toContain(
      `::notice title=Spec not in this PR head::${ABSENT}`,
    );
    expect(stdout).toContain('nothing to run');
    expect(stdout).toContain('after');
  });

  it('keeps a failing Playwright run failing', () => {
    const {status, calls} = step(
      `pnpm exec playwright test ${PRESENT} --project chromium\necho unreachable\n`,
      {PNPM_EXIT: '1'},
    );
    expect(status).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it('leaves every other pnpm command alone', () => {
    const {status, calls} = step(
      'pnpm install --frozen-lockfile\npnpm exec playwright install chromium\npnpm exec vitest run x.spec.ts\n',
    );
    expect(status).toBe(0);
    expect(calls).toEqual([
      'install --frozen-lockfile',
      'exec playwright install chromium',
      'exec vitest run x.spec.ts',
    ]);
  });
});
