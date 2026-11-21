// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Taking back the empty folders a write made, never a folder with a
 * file in it.
 *
 * @position foundation/fs — used by the theme editor (a copy and the themes
 *   root it made) and `theme add`/`theme remove` of a shared theme
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Remove `dir` when it is empty; with `deep`, the empty folders under it
 * first. A folder with a file in it stays.
 * @param {string} dir
 * @param {{deep?: boolean}} [opts]
 */
export function removeEmptyFolder(dir, opts = {}) {
  if (!fs.existsSync(dir)) return;
  if (opts.deep)
    for (const e of fs.readdirSync(dir, {withFileTypes: true}))
      if (e.isDirectory()) removeEmptyFolder(path.join(dir, e.name), opts);
  try {
    fs.rmdirSync(dir);
  } catch {
    // Not empty, or gone already.
  }
}
