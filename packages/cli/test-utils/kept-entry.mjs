// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Read and write a file in the CLI's cache of kept gathers as one
 *   object. A gather's entry holds two lines, what it is and stands for, then
 *   its value (foundation/fs/gather-cache.mjs); a derived value's entry and a
 *   summary are one JSON object.
 * @input A file in the cache folder.
 * @output The entry as one object, its value as `value`.
 * @position test-utils — the kept-catalog tests.
 */

import * as fs from 'node:fs';

/**
 * A kept file, as one object.
 * @param {string} file
 * @returns {any}
 */
export function readKept(file) {
  const text = fs.readFileSync(file, 'utf8');
  const cut = text.indexOf('\n');
  if (cut < 0) return JSON.parse(text);
  return {
    ...JSON.parse(text.slice(0, cut)),
    value: JSON.parse(text.slice(cut + 1)),
  };
}

/**
 * Write an entry `readKept` read back in its own layout: a gather's entry as
 * two lines (one, when its value was removed), anything else as one object.
 * @param {string} file
 * @param {any} entry
 */
export function writeKept(file, entry) {
  if (!Array.isArray(entry.stamps)) {
    fs.writeFileSync(file, JSON.stringify(entry));
    return;
  }
  const {value, ...head} = entry;
  fs.writeFileSync(
    file,
    Object.hasOwn(entry, 'value')
      ? `${JSON.stringify(head)}\n${JSON.stringify(value)}`
      : JSON.stringify(head),
  );
}
