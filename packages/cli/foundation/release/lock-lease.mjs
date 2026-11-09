// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The lease on a release install's lock in the per-user cache (spec
 * AST-081 FR11).
 *
 * A lock folder records its holder in `owner.json`: the process id and the
 * computer's name. On the same computer a waiting run checks whether that
 * process still runs. A cache shared between computers cannot check another
 * computer's processes, so the holder renews its record every
 * `LEASE_RENEW_MS` while the package manager works, and a waiting run takes
 * a lock from another computer over once it has seen the record go unrenewed
 * for `LEASE_SILENCE_MS`. The waiting run judges by change it observes, never
 * by comparing clocks, so computers whose clocks differ agree.
 *
 * @input  the lock folder
 * @output the renewed record, and whether a foreign record has gone silent
 * @position foundation/release — renewed by npm-guard.mjs, read by cache.mjs.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/** How often the holder renews its record while the package manager works. */
export const LEASE_RENEW_MS = 10_000;

/** How long a record from another computer may go unrenewed, as observed. */
export const LEASE_SILENCE_MS = 60_000;

/**
 * Renew the holder's record: the same process and computer, with a counter
 * that changes on every renewal. Never throws.
 * @param {string} lockDir
 */
export function renewLock(lockDir) {
  const file = path.join(lockDir, 'owner.json');
  try {
    const owner = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const next = {...owner, beat: (Number(owner.beat) || 0) + 1};
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next));
    fs.renameSync(tmp, file);
  } catch {
    // A lock that was taken over or removed has no record to renew.
  }
}

/**
 * What this process last saw of each foreign lock: the record's text and
 * when that text was first seen.
 * @type {Map<string, {text: string, since: number}>}
 */
const observed = new Map();

/**
 * Whether a lock held from another computer has gone silent: its record has
 * not changed for `LEASE_SILENCE_MS` of this process's own observation.
 * @param {string} lockDir
 * @param {number} [now]
 * @returns {boolean}
 */
export function foreignLockIsSilent(lockDir, now = Date.now()) {
  let text;
  try {
    text = fs.readFileSync(path.join(lockDir, 'owner.json'), 'utf-8');
  } catch {
    text = '';
  }
  const seen = observed.get(lockDir);
  if (!seen || seen.text !== text) {
    observed.set(lockDir, {text, since: now});
    return false;
  }
  return now - seen.since >= LEASE_SILENCE_MS;
}

/** Forget what this process observed (tests). */
export function forgetObservedLocks() {
  observed.clear();
}
