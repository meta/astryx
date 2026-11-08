// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Path comparison that matches the file system (spec AST-081 FR11):
 * Windows and macOS file systems ignore letter case by default, so two
 * spellings that differ only in case name the same folder there, and the
 * release choice must treat them as one.
 *
 * @input  paths and the platform
 * @output whether two paths are the same, and a path relative to a folder
 * @position packages/cli/foundation/fs — used by the release choice and the
 *   release cache.
 */

import * as path from 'node:path';

/**
 * Whether the platform's file systems ignore letter case by default.
 * @param {NodeJS.Platform} [platform]
 * @returns {boolean}
 */
export function ignoresCase(platform = process.platform) {
  return platform === 'win32' || platform === 'darwin';
}

/**
 * The path module of a platform.
 * @param {NodeJS.Platform} platform
 * @returns {typeof path.posix}
 */
function pathsOf(platform) {
  return platform === 'win32' ? path.win32 : path.posix;
}

/**
 * A path in the form two spellings of one folder share.
 * @param {string} p
 * @param {NodeJS.Platform} [platform]
 * @returns {string}
 */
export function pathKey(p, platform = process.platform) {
  const normal = pathsOf(platform).normalize(p);
  return ignoresCase(platform) ? normal.toLowerCase() : normal;
}

/**
 * Whether two paths name the same folder or file.
 * @param {string} a
 * @param {string} b
 * @param {NodeJS.Platform} [platform]
 * @returns {boolean}
 */
export function samePath(a, b, platform = process.platform) {
  return pathKey(a, platform) === pathKey(b, platform);
}

/**
 * `child` relative to `parent`, compared the way the file system compares
 * names; `null` when `child` is not inside `parent` (or is `parent`).
 * @param {string} parent
 * @param {string} child
 * @param {NodeJS.Platform} [platform]
 * @returns {string | null}
 */
export function relativeWithin(parent, child, platform = process.platform) {
  const paths = pathsOf(platform);
  const rel = paths.relative(
    pathKey(parent, platform),
    pathKey(child, platform),
  );
  if (rel === '' || rel.startsWith('..') || paths.isAbsolute(rel)) return null;
  return rel;
}
