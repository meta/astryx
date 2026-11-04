// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file motion-table-files.mjs
 * @input packages/core/src
 * @output motionTableFiles: every non-test source file that registers a motion
 *   table (a `register<Name>Table` function, or a legacy module-level
 *   `registerMotionTable` call)
 * @position Used by packages/core/src/motion/roles.test.ts to register every
 *   table the way discovery would. Tooling only: nothing at runtime registers
 *   every table.
 */

import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

/**
 * Every motion table module under `dir`, sorted.
 * @param {string} dir
 * @returns {string[]}
 */
export function motionTableFiles(dir) {
  /** @type {string[]} */
  const files = [];
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '__tests__') {
        files.push(...motionTableFiles(path));
      }
    } else if (
      /\.tsx?$/.test(entry.name) &&
      !/\.(test|spec|stories)\.tsx?$/.test(entry.name) &&
      entry.name !== 'roles.ts' &&
      /registerMotionTable\(/.test(readFileSync(path, 'utf8'))
    ) {
      files.push(path);
    }
  }
  return files.sort();
}

/** A module export that registers a table. */
export const REGISTER_EXPORT = /^register[A-Z]\w*Table$/;
