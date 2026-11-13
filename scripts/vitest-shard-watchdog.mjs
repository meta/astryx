// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A Vitest reporter for the Node legs: it names a stuck test file
 * before the leg's job limit stops the run, and records each file's time.
 *
 * A job that a time limit cancels keeps only part of its log, so a stuck test
 * file and an overloaded runner look the same. When `VITEST_SHARD_WATCHDOG_SECONDS`
 * passes, this reporter prints every test file still running with how long it
 * has run, and ends the run with "shard stuck in <file>", the file that has run
 * longest. When `VITEST_SHARD_TIMES_FILE` is set, it writes each finished
 * file's seconds there as JSON, for the recorded-times check.
 *
 * @input env VITEST_SHARD_WATCHDOG_SECONDS, VITEST_SHARD_TIMES_FILE
 * @output stdout lines and exit code 1 when the watchdog fires; the times file
 * @position scripts — a reporter the Node legs pass to `pnpm test:node`
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const relative = (/** @type {string} */ file) =>
  path.relative(process.cwd(), file).split(path.sep).join('/');

export default class ShardWatchdog {
  constructor() {
    /** @type {Map<string, number>} test file -> start time (ms) */
    this.running = new Map();
    /** @type {Record<string, number>} test file -> seconds */
    this.seconds = {};
    this.started = Date.now();
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.timer = undefined;
  }

  onInit() {
    const limit = Number(process.env.VITEST_SHARD_WATCHDOG_SECONDS);
    if (Number.isFinite(limit) && limit > 0) {
      this.timer = setTimeout(() => this.fire(limit), limit * 1000);
      this.timer.unref?.();
    }
  }

  // The clock starts when the file is queued, before Vitest imports it, so a
  // file that hangs at module level is listed too.
  /** @param {{moduleId: string}} testModule */
  onTestModuleQueued(testModule) {
    this.running.set(testModule.moduleId, Date.now());
  }

  /** @param {{moduleId: string}} testModule */
  onTestModuleStart(testModule) {
    if (!this.running.has(testModule.moduleId)) {
      this.running.set(testModule.moduleId, Date.now());
    }
  }

  /** @param {{moduleId: string}} testModule */
  onTestModuleEnd(testModule) {
    const start = this.running.get(testModule.moduleId);
    this.running.delete(testModule.moduleId);
    if (start != null) {
      this.seconds[relative(testModule.moduleId)] =
        Math.round((Date.now() - start) / 100) / 10;
    }
    this.writeTimes();
  }

  onTestRunEnd() {
    clearTimeout(this.timer);
    this.writeTimes();
  }

  writeTimes() {
    const file = process.env.VITEST_SHARD_TIMES_FILE;
    if (!file) return;
    try {
      fs.writeFileSync(file, `${JSON.stringify(this.seconds, null, 2)}\n`);
    } catch {}
  }

  /** @param {number} limit */
  fire(limit) {
    const now = Date.now();
    const rows = [...this.running]
      .map(([file, start]) => ({
        file: relative(file),
        seconds: Math.round((now - start) / 1000),
      }))
      .sort((a, b) => b.seconds - a.seconds);
    const lines = [
      '',
      `The Node shard ran ${limit} s, near its job's time limit. Test files still running:`,
      ...(rows.length
        ? rows.map(row => `  ${row.file}  running for ${row.seconds} s`)
        : ['  (none: the shard is not inside a test file)']),
      `::error title=Node shard stuck::shard stuck in ${rows[0]?.file ?? 'setup, before any test file'} (${rows[0] ? `${rows[0].seconds} s` : `${limit} s`}); every running file is listed above`,
    ];
    process.stdout.write(`${lines.join('\n')}\n`);
    this.writeTimes();
    process.exit(1);
  }
}
