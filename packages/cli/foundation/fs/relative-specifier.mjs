// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The relative import specifier from one written file to another, as a
 * module writes it: `/`-separated, starting with `./` or `../`, and without
 * the module extension (`.d.ts` and its `.d.mts`/`.d.cts` forms drop whole).
 *
 * @input  two file paths
 * @output the specifier the first file imports the second by
 * @position packages/cli/foundation/fs — used by swizzle copy and render
 *   reverse.
 */

import * as path from 'node:path';

const DECLARATION_FILE = /\.d\.[cm]?ts$/;

/**
 * The relative specifier from one written file to another.
 * @param {string} fromFile the importing file
 * @param {string} toFile the imported file
 * @returns {string}
 */
export function relativeSpecifierBetween(fromFile, toFile) {
  let rel = path.relative(path.dirname(fromFile), toFile).split(path.sep).join('/');
  rel = DECLARATION_FILE.test(toFile) ? rel.replace(DECLARATION_FILE, '') : rel.replace(/\.(?:[cm]?[jt]sx?)$/, '');
  return rel.startsWith('.') ? rel : `./${rel}`;
}
