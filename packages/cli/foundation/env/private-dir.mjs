// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The check a folder of cached code or data must pass before the CLI
 *   reads from it: Node's compile cache (clients/cli/bin/astryx.mjs) and the
 *   kept search catalogs (foundation/fs/gather-cache.mjs). Built-ins only, so
 *   the bin can load it before anything else.
 */

import * as fs from 'node:fs';

/**
 * The current user's id, or null where the system has none (Windows).
 * @returns {number | null}
 */
export function currentUid() {
  return typeof process.getuid === 'function' ? process.getuid() : null;
}

/**
 * Whether `dir` is a real folder (not a link) that the current user owns and
 * no one else can reach, so nothing in it can have been planted by another
 * account. False where the system has no user ids (Windows): ownership cannot
 * be checked there, so such a folder is never used.
 * @param {string} dir
 * @returns {boolean}
 */
export function isPrivateDir(dir) {
  const uid = currentUid();
  if (uid == null) return false;
  try {
    const stat = fs.lstatSync(dir);
    return (
      stat.isDirectory() &&
      !stat.isSymbolicLink() &&
      stat.uid === uid &&
      (stat.mode & 0o077) === 0
    );
  } catch {
    return false;
  }
}
