// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The folder a restore without --out writes into, by name: shared by
 * the restore itself and the command line that the render prints for it.
 * @position foundation/render — read by api/render/_adapter.mjs and the
 *   render command
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * The first restore folder for `file` that `dir` does not hold yet:
 * `<name>-restored`, then `<name>-restored-2` and so on.
 * @param {string} dir absolute
 * @param {string} file the rendered file's name
 * @param {(folder: string) => void} [onTaken] called with each name already
 *   taken, before the next is tried
 * @returns {string} absolute
 */
export function freeRestoreFolder(dir, file, onTaken = () => {}) {
  const stem = file.replace(/\.[^.]+$/, '');
  let folder = path.join(dir, `${stem}-restored`);
  for (let n = 2; fs.existsSync(folder); n++) {
    onTaken(folder);
    folder = path.join(dir, `${stem}-restored-${n}`);
  }
  return folder;
}
