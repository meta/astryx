// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Runs one package-manager command so that it can never outlive the
 * run that started it.
 *
 * `runNpm` (cache.mjs) starts this file instead of npm itself. It starts npm
 * in a process group of its own, records npm's process id where the release
 * lock can find it, and ends npm's whole group when any of these happens:
 *
 * - the time limit passes (exit status 124);
 * - the run that started it goes away, even when it was killed outright and
 *   had no chance to clean up (its parent process changes);
 * - it receives Ctrl-C, a closed terminal, or a termination request: it ends
 *   npm's group outright (npm defers these signals and would keep this run's
 *   output pipes open), then ends the same way.
 *
 * While npm works it renews the lock's owner record every 10 seconds
 * (lock-lease.mjs), so a run on another computer that shares the cache knows
 * the install is alive.
 *
 * Not a command and takes no options of its own; its arguments come only
 * from `runNpm`.
 *
 * @input  argv: time limit (ms), process-id file ('' for none), command, args
 * @output npm's exit status; npm's output on the inherited streams
 * @position foundation/release — started only by cache.mjs.
 */

import {spawn} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {LEASE_RENEW_MS, renewLock} from './lock-lease.mjs';

const [timeoutArg, pidFile, command, ...args] = process.argv.slice(2);
const timeoutMs = Number(timeoutArg);
const parent = process.ppid;
const posix = process.platform !== 'win32';

const child = spawn(command, args, {
  stdio: 'inherit',
  detached: posix,
  windowsHide: true,
});

/** End npm and everything it started. @param {NodeJS.Signals} signal */
function endGroup(signal) {
  try {
    if (posix && child.pid) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch {
    // Already gone.
  }
}

if (pidFile && child.pid) {
  try {
    fs.writeFileSync(pidFile, String(child.pid));
  } catch {
    // Without the record a takeover cannot end npm; the watch below still does.
  }
}

/**
 * Remove the process-id record: once npm is ended, its id may be reused by
 * an unrelated process, which a later takeover must never end.
 */
function forgetPid() {
  if (pidFile) fs.rmSync(pidFile, {force: true});
}

const limit = setTimeout(() => {
  endGroup('SIGKILL');
  forgetPid();
  process.exit(124);
}, timeoutMs);

const watch = setInterval(() => {
  if (process.ppid !== parent) {
    endGroup('SIGKILL');
    forgetPid();
    process.exit(1);
  }
}, 500);

// The lock beside the pid file is renewed while npm works, so a run on
// another computer sharing the cache knows its holder is alive.
const lease = pidFile
  ? setInterval(() => renewLock(path.dirname(pidFile)), LEASE_RENEW_MS)
  : null;
lease?.unref();

for (const signal of /** @type {NodeJS.Signals[]} */ ([
  'SIGINT',
  'SIGTERM',
  'SIGHUP',
])) {
  process.on(signal, () => {
    // npm defers these signals until its work finishes, and it holds this
    // run's output pipes open, so it is ended outright.
    endGroup('SIGKILL');
    forgetPid();
    clearTimeout(limit);
    clearInterval(watch);
    process.removeAllListeners(signal);
    process.kill(process.pid, signal);
  });
}

child.on('error', () => {
  clearTimeout(limit);
  clearInterval(watch);
  forgetPid();
  process.exit(127);
});

child.on('exit', (code, signal) => {
  clearTimeout(limit);
  clearInterval(watch);
  forgetPid();
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
