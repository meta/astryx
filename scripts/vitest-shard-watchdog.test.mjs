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

/**
 * The watchdog's settings and its times file come only from each case: a Node
 * leg exports them for its own run, and its times file records that leg's
 * files, so a fixture run must not take any of them over.
 */
function withoutShardSettings() {
  return Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST_SHARD_')),
  );
}

/**
 * @param {string[]} files
 * @param {Record<string, string>} env
 * @param {{timeout?: number}} [options]
 */
function runFixtures(files, env, {timeout = 60_000} = {}) {
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
      timeout,
      env: {...withoutShardSettings(), CI: 'true', ...env},
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

  it('with VITEST_SHARD_WATCHDOG_NAME_ONLY=1, names the running file as a warning and lets the run go on, so the job limit ends it', () => {
    const result = runFixtures(
      ['hang.fixture.mjs', 'quick.fixture.mjs'],
      {
        VITEST_SHARD_WATCHDOG_SECONDS: '3',
        VITEST_SHARD_WATCHDOG_NAME_ONLY: '1',
      },
      {timeout: 15_000},
    );
    const out = result.stdout + result.stderr;
    // The run outlives the watchdog: the outer limit (here spawnSync's
    // timeout, on CI the job's time limit) stops it, so it ends cancelled,
    // not as a failed run.
    expect(result.error?.code, out).toBe('ETIMEDOUT');
    // Ended by the outer limit's signal (Vitest exits 143 on SIGTERM), never
    // by the watchdog's own exit 1.
    expect([null, 143], out).toContain(result.status);
    expect(out).toMatch(
      /Test files still running:\n {2}scripts\/fixtures\/shard-watchdog\/hang\.fixture\.mjs {2}running for \d+ s/,
    );
    expect(out).toContain(
      '::warning title=Node shard near its limit::still running at 3 s: scripts/fixtures/shard-watchdog/hang.fixture.mjs',
    );
    expect(out).not.toContain('::error title=Node shard stuck');
  }, 60_000);

  it('with VITEST_SHARD_WATCHDOG_NAME_ONLY=1, a run that finishes after the warning passes', () => {
    const result = runFixtures(['slow-import.fixture.mjs'], {
      VITEST_SHARD_WATCHDOG_SECONDS: '1',
      VITEST_SHARD_WATCHDOG_NAME_ONLY: '1',
    });
    const out = result.stdout + result.stderr;
    expect(result.status, out).toBe(0);
    expect(out).toContain('::warning title=Node shard near its limit::');
  }, 60_000);

  it('fails a stuck run whatever the leg running these tests sets for its own watchdog', () => {
    const saved = {
      name: process.env.VITEST_SHARD_WATCHDOG_NAME_ONLY,
      seconds: process.env.VITEST_SHARD_WATCHDOG_SECONDS,
    };
    // As Main's Node step sets them for its own leg.
    process.env.VITEST_SHARD_WATCHDOG_NAME_ONLY = '1';
    process.env.VITEST_SHARD_WATCHDOG_SECONDS = '600';
    try {
      const result = runFixtures(['hang-import.fixture.mjs'], {
        VITEST_SHARD_WATCHDOG_SECONDS: '4',
      });
      const out = result.stdout + result.stderr;
      expect(result.status, out).toBe(1);
      expect(out).toContain(
        '::error title=Node shard stuck::shard stuck in scripts/fixtures/shard-watchdog/hang-import.fixture.mjs',
      );
    } finally {
      for (const [k, v] of /** @type {const} */ ([
        ['VITEST_SHARD_WATCHDOG_NAME_ONLY', saved.name],
        ['VITEST_SHARD_WATCHDOG_SECONDS', saved.seconds],
      ]))
        if (v == null) delete process.env[k];
        else process.env[k] = v;
    }
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

  it('leaves the times file of the leg running these tests untouched', () => {
    const legTimes = path.join(scratch, 'leg-times.json');
    const recorded = '{"packages/core/src/Button/Button.test.ts": 1.25}\n';
    fs.writeFileSync(legTimes, recorded);
    const saved = process.env.VITEST_SHARD_TIMES_FILE;
    // As a Node leg sets it for its own files.
    process.env.VITEST_SHARD_TIMES_FILE = legTimes;
    try {
      const result = runFixtures(['quick.fixture.mjs'], {
        VITEST_SHARD_WATCHDOG_SECONDS: '60',
      });
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(fs.readFileSync(legTimes, 'utf8')).toBe(recorded);
    } finally {
      if (saved == null) delete process.env.VITEST_SHARD_TIMES_FILE;
      else process.env.VITEST_SHARD_TIMES_FILE = saved;
    }
  }, 60_000);
});
