// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A folder lock for a command that may take a while: the release
 * cache's lock (cache.mjs `tryLock`), held with its lease (lock-lease.mjs
 * `renewLock`) for as long as the command runs, so a run on another computer
 * or container never takes it over while it is held.
 *
 * @input  a lock folder and the work to run under it
 * @output the work's result; the lock is released on the way out, also on
 *   Ctrl-C, and only when it is still this run's own
 * @position foundation/release — used by the theme editor (api/theme-edit/_adapter.mjs).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {tryLock} from './cache.mjs';
import {LEASE_RENEW_MS, renewLock} from './lock-lease.mjs';

/** The lock folders this process holds now. */
const HELD = new Set();

/** @param {number} ms */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** @param {string} file @returns {any} */
const readOwner = file => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

/**
 * Run `fn` holding the lock folder `lockDir`. A run waits while another
 * holds it; the wait starts again each time the lock changes hands, and
 * `onBusy` is called (it throws) when one holder keeps it longer than
 * `waitMs`. The lock is renewed while `fn` runs.
 * @template T
 * @param {string} lockDir
 * @param {() => Promise<T>} fn
 * @param {{waitMs?: number, onBusy: (owner: any, heldSeconds: number | null) => never}} options
 * @returns {Promise<T>}
 */
export async function withFolderLock(lockDir, fn, {waitMs = 30_000, onBusy}) {
  const ownerFile = path.join(lockDir, 'owner.json');
  /** @returns {number | null} seconds since the lock was taken or renewed */
  const age = () => {
    try {
      return Math.round((Date.now() - fs.statSync(lockDir).mtimeMs) / 1000);
    } catch {
      return null;
    }
  };
  let holder = JSON.stringify(readOwner(ownerFile)?.pid ?? null);
  for (let waited = 0; !tryLock(lockDir); waited += 50) {
    const now = JSON.stringify(readOwner(ownerFile)?.pid ?? null);
    if (now !== holder) {
      holder = now;
      waited = 0;
    }
    if (waited > waitMs) onBusy(readOwner(ownerFile), age());
    await sleep(50);
  }
  HELD.add(lockDir);
  const mine = readOwner(ownerFile);
  const same = (/** @type {any} */ o) =>
    o != null &&
    mine != null &&
    o.pid === mine.pid &&
    o.host === mine.host &&
    o.at === mine.at;
  // The lease: renewed while held, so a waiting run on another computer
  // sees it change and never takes it over.
  const lease = setInterval(() => {
    if (same(readOwner(ownerFile))) renewLock(lockDir);
  }, LEASE_RENEW_MS);
  lease.unref();
  // Only this run's own lock is removed, never one another took over.
  const release = () => {
    try {
      if (same(readOwner(ownerFile)))
        fs.rmSync(lockDir, {recursive: true, force: true});
    } catch {
      // Gone already.
    }
  };
  // Stopped by a signal, the lock still goes.
  const onSignal = (/** @type {NodeJS.Signals} */ sig) => {
    release();
    process.kill(process.pid, sig);
  };
  process.once('exit', release);
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    return await fn();
  } finally {
    clearInterval(lease);
    release();
    HELD.delete(lockDir);
    process.removeListener('exit', release);
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
  }
}

/**
 * Whether this process holds a lock folder now.
 * @param {string} lockDir
 */
export const holdsFolderLock = lockDir => HELD.has(lockDir);
