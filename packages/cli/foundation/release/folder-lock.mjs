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
import {AsyncLocalStorage} from 'node:async_hooks';
import * as os from 'node:os';
import {isAlive, lockIdentity, pidSpace, tryLock} from './cache.mjs';
import {foreignLockIsSilent, LEASE_RENEW_MS, renewLock} from './lock-lease.mjs';

/** How long a held lock's record may stand unrenewed before it is taken over. */
export const SILENT_MS = 3 * LEASE_RENEW_MS;

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
  // The lock moved aside must be the one judged silent (by its identity
  // on disk and its record, as the release cache checks): a lock taken or
  // renewed in between is put back. When its place is taken again, it
  // stays aside for its run, and this run holds nothing.
  if (lockIdentity(aside) !== judged) {
    try {
      fs.renameSync(aside, lockDir);
    } catch {
      // Left for its run.
    }
    return;
  }
  fs.rmSync(aside, {recursive: true, force: true});
}

/**
 * Whether a lock's holder runs on this computer, in this process space: a
 * holder that is only stopped (Ctrl-Z, a sleeping laptop, a debugger) is
 * alive, however long its record stands unrenewed.
 * @param {any} owner
 */
function aliveHere(owner) {
  if (!owner || owner.host !== os.hostname() || !Number.isInteger(owner.pid))
    return false;
  const ns = pidSpace();
  if (owner.ns && ns && owner.ns !== ns) return false;
  return isAlive(owner.pid);
}

/** The lock the running work holds, for the check before each write. */
const holding = new AsyncLocalStorage();

/**
 * Throw when the work running under withFolderLock no longer holds its lock
 * (another run took it over while this one was stopped), so it writes
 * nothing more. Outside withFolderLock it does nothing. Call it right
 * before a write.
 */
export function stillHolds() {
  const h =
    /** @type {{ownerFile: string, same: (o: any) => boolean} | undefined} */ (
      holding.getStore()
    );
  if (!h || h.same(readOwner(h.ownerFile))) return;
  const error = /** @type {Error & {code?: string}} */ (
    new Error(
      'another command took over the lock while this one was stopped, so this one writes nothing more',
    )
  );
  error.code = 'ERR_LOCK_LOST';
  throw error;
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
  for (let waited = 0; !tryLock(lockDir, {leased: true}); waited += 50) {
    // The release cache's own judge of silence (what this process saw of
    // the record), with the editor's shorter window. The lock is judged by
    // its identity on disk, so the one moved aside is the one judged.
    const judged = lockIdentity(lockDir);
    if (
      judged &&
      foreignLockIsSilent(lockDir, Date.now(), SILENT_MS) &&
      !aliveHere(readOwner(ownerFile))
    ) {
      takeOver(lockDir, judged);
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
    return await holding.run({ownerFile, same}, fn);
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
