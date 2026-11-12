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
 * @position Read by module-loader.mjs, doc-compiler/import.mjs and
 *   gather-cache.mjs. jiti's default is a `jiti` folder in the system temp
 *   folder, which on Linux every account on a machine shares, and which the
 *   system empties from time to time: another account could leave transpiled
 *   code there under the name jiti looks for,
 *   and after each emptying every TypeScript file is transpiled again. jiti
 *   names each cached file for its source's path and checks a hash of its
 *   source content before using it, so an edited, upgraded or downgraded
 *   file is transpiled again wherever the cache is. A set JITI_FS_CACHE is
 *   jiti's own setting and left to jiti.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {currentUid, isPrivateDir} from '../env/private-dir.mjs';
import {userCacheDir} from '../env/user-dirs.mjs';

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
 * no one else can reach (the kept catalogs' check). A folder that fails the
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
    if (isPrivateDir(dir)) options = {fsCache: dir};
  } catch {
    // No disk cache: every TypeScript file is transpiled in memory.
  }
  return options;
}
