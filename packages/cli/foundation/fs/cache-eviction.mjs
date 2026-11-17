// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Keeps a per-user cache folder within its size limit: the oldest files
 *   go first.
 * @input A cache folder, and which of its files count.
 * @output `CACHE_LIMIT_BYTES`, the most a cache folder holds, and
 *   `evictOldest(dir, counts)`, which deletes the folder's oldest counted
 *   files until it holds at most that (never one it is told to keep), and
 *   says when the oldest file it kept was last used.
 * @position Used by gather-cache.mjs for the kept catalogs. jiti-cache.mjs
 *   keeps the copies of transpiled code within a limit of the same size,
 *   trimming one subfolder at a time.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/** The most a cache folder holds; the oldest files go first past it. */
export const CACHE_LIMIT_BYTES = 64 * 1024 * 1024;

/**
 * When a file was last used, by default its last write (a kept catalog is
 * written again when it is read back).
 * @param {fs.Stats} stat
 * @returns {number}
 */
const lastWrite = stat => stat.mtimeMs;

/**
 * Delete the folder's counted files, least recently used first, until they
 * hold at most `limit` bytes. A file used at `keepUsedSince` or later is kept,
 * even while the folder holds more, and so is the file `keep` names, though
 * it counts toward the limit. Only regular files directly in the folder
 * count: never a link, a folder, or anything inside one. A file another run
 * removes first is left to that run.
 * @param {string} dir
 * @param {(name: string) => boolean} counts - whether a file name counts
 * @param {{limit?: number, keepUsedSince?: number, lastUse?: (stat: fs.Stats) => number, keep?: string}} [options]
 * @returns {number} when the least recently used file it kept was last used
 *   (Infinity when it kept none)
 */
export function evictOldest(
  dir,
  counts,
  {
    limit = CACHE_LIMIT_BYTES,
    keepUsedSince = Infinity,
    lastUse = lastWrite,
    keep,
  } = {},
) {
  const entries = fs
    .readdirSync(dir)
    .filter(counts)
    .map(name => {
      const entry = path.join(dir, name);
      try {
        const stat = fs.lstatSync(entry);
        if (!stat.isFile()) return null;
        return {entry, size: stat.size, used: lastUse(stat)};
      } catch {
        return null;
      }
    })
    .filter(e => e != null)
    .sort((a, b) => a.used - b.used);
  let total = entries.reduce((sum, e) => sum + e.size, 0);
  let oldestKept = Infinity;
  let next = 0;
  for (; next < entries.length; next++) {
    const {entry, size, used} = entries[next];
    if (total <= limit || used >= keepUsedSince) break;
    if (entry === keep) {
      oldestKept = Math.min(oldestKept, used);
      continue;
    }
    try {
      fs.unlinkSync(entry);
      total -= size;
    } catch {
      // Another run removed it.
    }
  }
  return Math.min(oldestKept, entries[next]?.used ?? Infinity);
}
