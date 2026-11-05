// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file present-files.mjs
 * @input A folder and the file names to look for in it
 * @output findPresentFiles: the paths of those that exist, in order
 * @position packages/cli/foundation/fs: node builtins only, so a run reads it
 *   without module-loader.mjs and its jiti. module-loader.mjs re-exports it.
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
