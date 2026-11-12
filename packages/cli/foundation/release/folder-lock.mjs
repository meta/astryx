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

/** How long a held lock's record may stand unrenewed before it is taken over. */
export const SILENT_MS = 3 * LEASE_RENEW_MS;

/** @param {string} file @returns {string} */
const recordText = file => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
};

/**
 * Move a silent lock aside and remove it; another run that moved it first
 * wins, and this one tries again.
 * @param {string} lockDir
 * @param {string} judged the record seen silent
 */
function takeOver(lockDir, judged) {
  const aside = `${lockDir}.silent-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    fs.renameSync(lockDir, aside);
  } catch {
    return;
  }
  // The lock moved aside must hold the record judged silent: a lock taken
  // or renewed in between is put back.
  if (recordText(path.join(aside, 'owner.json')) !== judged) {
    try {
      fs.renameSync(aside, lockDir);
    } catch {
      // Its place is taken again.
    }
    return;
  }
  fs.rmSync(aside, {recursive: true, force: true});
}

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
  /** @returns {number | null} seconds since the holder took the lock */
  const held = () => {
    const at = readOwner(ownerFile)?.at;
    return typeof at === 'number'
      ? Math.max(0, Math.round((Date.now() - at) / 1000))
      : null;
  };
  // A holder is its process, computer and the moment it took the lock: a
  // new holder with the same process id (another container) is a new one.
  const holderOf = () => {
    const o = readOwner(ownerFile);
    return JSON.stringify([o?.pid ?? null, o?.host ?? null, o?.at ?? null]);
  };
  let holder = holderOf();
  // A holder renews its record every LEASE_RENEW_MS. One whose record has
  // not changed for three of those, as this run sees it, has stopped,
  // whatever computer or process id it names (pid 1 in a container, a
  // computer whose processes this run cannot check).
  let record = recordText(ownerFile);
  let since = Date.now();
  for (let waited = 0; !tryLock(lockDir); waited += 50) {
    const text = recordText(ownerFile);
    if (text !== record) {
      record = text;
      since = Date.now();
    } else if (Date.now() - since >= SILENT_MS) {
      takeOver(lockDir, record);
      since = Date.now();
      continue;
    }
    const now = holderOf();
    if (now !== holder) {
      holder = now;
      waited = 0;
    }
    if (waited > waitMs) onBusy(readOwner(ownerFile), held());
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
