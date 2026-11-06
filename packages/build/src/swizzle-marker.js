// Copyright (c) Meta Platforms, Inc. and affiliates.

'use strict';

/**
 * @astryxdesign/build: swizzled copies. `astryx swizzle` writes
 * `astryx-swizzle.json` into its output folder. Every module under a folder
 * that holds the marker is Astryx source: the library pass compiles it with
 * the library class prefix into the library layer, below `astryx-theme`, so a
 * theme's component overrides reach the copy as they reach the package.
 */

const fs = require('node:fs');
const path = require('node:path');

/** The file `astryx swizzle` writes into its output folder. */
const SWIZZLE_MARKER = 'astryx-swizzle.json';

/**
 * Whether a module is in a swizzled copy: a folder at or above it holds the
 * marker. Pass one `memo` to the checks of one build pass, so each folder is
 * looked up once; nothing is kept between passes, so a copy swizzled while a
 * dev server runs counts from the next pass.
 * @param {string} filePath an absolute module path
 * @param {Map<string, boolean>} [memo] folder -> whether it or a folder
 *   above it holds the marker
 * @returns {boolean}
 */
function isSwizzledSource(filePath, memo = new Map()) {
  /** @type {string[]} */
  const visited = [];
  let dir = path.dirname(filePath);
  let marked = false;
  for (;;) {
    const known = memo.get(dir);
    if (known !== undefined) {
      marked = known;
      break;
    }
    visited.push(dir);
    if (fs.existsSync(path.join(dir, SWIZZLE_MARKER))) {
      marked = true;
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const folder of visited) memo.set(folder, marked);
  return marked;
}

module.exports = {SWIZZLE_MARKER, isSwizzledSource};
