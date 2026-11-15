// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Where jiti keeps the code it transpiles from TypeScript (integration
 *   manifests, config files, codemods, TypeScript template docs).
 * @input The per-user cache folder (foundation/env/user-dirs.mjs) and the
 *   private-folder check (foundation/env/private-dir.mjs).
 * @output `jitiCacheOptions()`: the `fsCache` option for the CLI's jiti
 *   loaders: `{fsCache: <user cache>/jiti}` when that folder is the user's
 *   own and no one else can reach it; `{fsCache: false}` (transpiled in
 *   memory only) when it is not; `{}` (jiti's own default) where the system
 *   has no user ids (Windows), whose temp folder is the user's own.
 * @position Read by module-loader.mjs, doc-compiler/import.mjs,
 *   theme build (api/theme/build/build.mjs) and gather-cache.mjs. jiti's default is a `jiti` folder in the system temp
 *   folder, which on Linux every account on a machine shares, and which the
 *   system empties from time to time: another account could leave transpiled
 *   code there under the name jiti looks for,
 *   and after each emptying every TypeScript file is transpiled again. jiti
 *   names each cached file for its source's path and checks a hash of its
 *   source content before using it, so an edited, upgraded or downgraded
 *   file is transpiled again wherever the cache is. Each new source path adds
 *   a file, so the folder is kept within CACHE_LIMIT_BYTES (cache-eviction.mjs):
 *   a run that finds it grown since the last check removes its least recently
 *   used copies (isTranspiledCopy), and nothing else, never one written in
 *   the last day or read in the last day where the file system records reads.
 *   A copy that is gone or cut short is a miss, and jiti transpiles the
 *   source again.
 *   A set JITI_FS_CACHE is jiti's own setting and left to jiti.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {currentUid, isPrivateDir} from '../env/private-dir.mjs';
import {userCacheDir} from '../env/user-dirs.mjs';
import {CACHE_LIMIT_BYTES, evictOldest} from './cache-eviction.mjs';
import {withoutRecording} from './read-record.mjs';

/** @type {{fsCache?: string | false} | undefined} */
let options;

/**
 * The per-user folder for jiti's transpiled code.
 * @returns {string}
 */
export function jitiCacheDir() {
  return path.join(userCacheDir(), 'jiti');
}

/**
 * The `fsCache` option for a jiti loader: the per-user folder, made (0700)
 * on first use and used at once, while it is a real folder the user owns and
 * no one else can reach (the kept catalogs' check), kept within its size
 * limit (keepWithinLimit). A folder that fails the
 * check, or cannot be made, is not used and nothing is cached on disk. Where
 * the system has no user ids (Windows) ownership cannot be checked, and jiti
 * keeps its default, the user's own temp folder there. Worked out once per
 * process.
 * @returns {{fsCache?: string | false}}
 */
export function jitiCacheOptions() {
  if (options) return options;
  options = {};
  if (process.env.JITI_FS_CACHE !== undefined || currentUid() == null) {
    return options;
  }
  options = {fsCache: false};
  try {
    const dir = jitiCacheDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true, mode: 0o700});
    if (isPrivateDir(dir)) {
      options = {fsCache: dir};
      // The cache's own upkeep, never an input of what a kept gather holds.
      withoutRecording(() => keepWithinLimit(dir));
    }
  } catch {
    // No disk cache: every TypeScript file is transpiled in memory.
  }
  return options;
}

/**
 * The file in the folder that holds the folder's time at the last check. Its
 * name has no hash, so it is never taken for a copy (isTranspiledCopy).
 */
const CHECKED = '.checked';

/** A day, in milliseconds. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long a copy is kept after its last use, whatever the folder holds.
 * jiti checks that a copy exists and then reads it, with no fallback if the
 * copy is gone in between, so the size limit never removes a copy a run may
 * be reading: one written in the last day, or read in the last day where the
 * file system records reads. Most systems record a read time at most once a
 * day, so a read in the last day leaves a read time in the last two days.
 */
const RECENT_USE_MS = 2 * DAY_MS;

/**
 * When a copy was last used: its last write (jiti writes a copy when it
 * transpiles the source), or its last read where the file system records one.
 * @param {fs.Stats} stat
 * @returns {number}
 */
const lastUse = stat => Math.max(stat.mtimeMs, stat.atimeMs);

/**
 * How jiti names a transpiled copy: the source's folder and stem (a dot
 * folder keeps its dot), a hash of the source's path, and `.cjs` or `.mjs`
 * (with `x` for JSX).
 */
const TRANSPILED_COPY = /\.[0-9a-f]{8}\.[cm]jsx?$/;

/**
 * Whether a file in the folder is a copy jiti wrote, the only files the size
 * limit removes.
 * @param {string} name
 * @returns {boolean}
 */
export function isTranspiledCopy(name) {
  return TRANSPILED_COPY.test(name);
}

/**
 * The folder's time at the last check, or null when there is no record: a
 * record that is not a regular file is never read or written (links in the
 * folder are never followed).
 * @param {string} checked
 * @returns {string | null}
 */
function lastCheck(checked) {
  try {
    if (!fs.lstatSync(checked).isFile()) return null;
    return fs.readFileSync(checked, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Record the folder's time. The record is made once, empty, which moves the
 * folder's time; after that it is written in place, which does not, so the
 * time it holds is the time a later run reads. Making it never replaces
 * anything at its name, and writing it never follows a link.
 * @param {string} dir
 * @param {string} checked
 */
function recordCheck(dir, checked) {
  let stat = null;
  try {
    stat = fs.lstatSync(checked);
  } catch {
    fs.writeFileSync(checked, '', {flag: 'wx', mode: 0o600});
  }
  if (stat != null && !stat.isFile()) return;
  const fd = fs.openSync(
    checked,
    fs.constants.O_WRONLY | fs.constants.O_TRUNC | fs.constants.O_NOFOLLOW,
  );
  try {
    fs.writeSync(fd, String(fs.statSync(dir).mtimeMs));
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Keep the folder within `limit` bytes, least recently used copies first,
 * never one used within RECENT_USE_MS. The folder's time moves only when a
 * file is made or removed, which is the only way the folder grows (jiti
 * writes an edited source's code over its old file), so a run whose folder
 * time matches the last check reads no more than that.
 * @param {string} dir
 * @param {number} [limit]
 */
export function keepWithinLimit(dir, limit = CACHE_LIMIT_BYTES) {
  const checked = path.join(dir, CHECKED);
  try {
    if (lastCheck(checked) === String(fs.statSync(dir).mtimeMs)) return;
    evictOldest(dir, isTranspiledCopy, {
      limit,
      keepUsedSince: Date.now() - RECENT_USE_MS,
      lastUse,
    });
    recordCheck(dir, checked);
  } catch {
    // A folder that cannot be checked is checked again by a later run.
  }
}
