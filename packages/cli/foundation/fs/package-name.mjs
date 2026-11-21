// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A package.json's `name`, read again only when the file changes.
 * @input The path of a package.json.
 * @output Its `name`, or undefined when it is absent or unreadable.
 * @position foundation/fs — theme build's walk up to Core's folder
 */

import * as fs from 'node:fs';
import {fileStamp, recordContentRead} from './read-record.mjs';

/** Each name read, by path, with the file's stamp then. */
const names = new Map();

/**
 * The `name` in the package.json at `file`. A name kept from an unchanged
 * file counts as a read of the file, as reading it does.
 * @param {string} file
 * @returns {unknown}
 */
export function packageNameAt(file) {
  const stamp = fileStamp(file);
  const kept = names.get(file);
  if (kept?.stamp === stamp) {
    recordContentRead(file);
    return kept.name;
  }
  let name;
  try {
    name = JSON.parse(fs.readFileSync(file, 'utf-8'))?.name;
  } catch {
    // Absent, unreadable, or not JSON: no name.
  }
  names.set(file, {stamp, name});
  return name;
}
