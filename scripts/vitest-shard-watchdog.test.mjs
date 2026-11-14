// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The Node legs' watchdog names a stuck test file before the job limit
 * would cancel the leg, and records each file's time.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, describe, expect, it} from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const fixtures = path.join(root, 'scripts/fixtures/shard-watchdog');
const vitest = path.join(root, 'node_modules/vitest/vitest.mjs');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'shard-watchdog-'));
afterAll(() => fs.rmSync(scratch, {recursive: true, force: true}));

/** @param {string[]} files @param {Record<string, string>} env */
function runFixtures(files, env) {
  return spawnSync(
    process.execPath,
    [
      vitest,
      'run',
      '--config',
      path.join(fixtures, 'vitest.config.mjs'),
      '--reporter=default',
      `--reporter=${path.join(root, 'scripts/vitest-shard-watchdog.mjs')}`,
      ...files,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      timeout: 60_000,
      env: {...process.env, CI: 'true', ...env},
    },
  );
}

describe('the Node shard watchdog', () => {
  it('names the stuck test file and how long it ran, and fails the run', () => {
    const result = runFixtures(['hang.fixture.mjs', 'quick.fixture.mjs'], {
      VITEST_SHARD_WATCHDOG_SECONDS: '4',
    });
    const out = result.stdout + result.stderr;
    expect(result.status, out).toBe(1);
    expect(out).toMatch(
      /Test files still running:\n {2}scripts\/fixtures\/shard-watchdog\/hang\.fixture\.mjs {2}running for \d+ s/,
    );
    expect(out).toContain(
      '::error title=Node shard stuck::shard stuck in scripts/fixtures/shard-watchdog/hang.fixture.mjs',
    );
  }, 60_000);

  it('names a file that hangs while it loads, before any test starts', () => {
    const result = runFixtures(['hang-import.fixture.mjs'], {
      VITEST_SHARD_WATCHDOG_SECONDS: '4',
    });
    const out = result.stdout + result.stderr;
    expect(result.status, out).toBe(1);
    expect(out).toContain(
      '::error title=Node shard stuck::shard stuck in scripts/fixtures/shard-watchdog/hang-import.fixture.mjs',
    );
  }, 60_000);

  it("records each finished file's seconds, and stays quiet when nothing is stuck", () => {
    const times = path.join(scratch, 'times.json');
    const result = runFixtures(['quick.fixture.mjs'], {
      VITEST_SHARD_WATCHDOG_SECONDS: '60',
      VITEST_SHARD_TIMES_FILE: times,
    });
    const out = result.stdout + result.stderr;
    expect(result.status, out).toBe(0);
    expect(out).not.toContain('shard stuck');
    const recorded = JSON.parse(fs.readFileSync(times, 'utf8'));
    expect(Object.keys(recorded)).toEqual([
      'scripts/fixtures/shard-watchdog/quick.fixture.mjs',
    ]);
    expect(
      typeof recorded['scripts/fixtures/shard-watchdog/quick.fixture.mjs'],
    ).toBe('number');
  }, 60_000);

  it("records a file's own test time, as the recorded times do, not its loading", () => {
    const times = path.join(scratch, 'times-import.json');
    const result = runFixtures(['slow-import.fixture.mjs'], {
      VITEST_SHARD_WATCHDOG_SECONDS: '60',
      VITEST_SHARD_TIMES_FILE: times,
    });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const seconds = JSON.parse(fs.readFileSync(times, 'utf8'))[
      'scripts/fixtures/shard-watchdog/slow-import.fixture.mjs'
    ];
    // It spent 1.5 s loading and well under a second in its test.
    expect(seconds).toBeLessThan(1);
  }, 60_000);
});
