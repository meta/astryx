// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file present-files.mjs
 * @input A directory and precedence-ordered file names
 * @output Exports findPresentFiles
 * @position A leaf of module-loader.mjs, which re-exports it. The config and
 *   manifest lookups read it without the module loader and jiti.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Return the conventional files (by basename, in the given precedence order)
 * that exist directly in `dir`, as absolute paths. Never throws.
 * @param {string} dir
 * @param {string[]} basenames precedence-ordered
 * @returns {string[]} absolute paths of present files, in basenames order
 */
export function findPresentFiles(dir, basenames) {
  return basenames
    .filter(name => fs.existsSync(path.join(dir, name)))
    .map(name => path.join(dir, name));
}
