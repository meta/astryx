// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Empty folders: whether one holds nothing of anyone's, and taking
 * back the empty folders a write made, never a folder with a file in it.
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

/**
 * Whether a path is a folder, or a link that leads to one: what a folder
 * the CLI writes into must be. Absent, a file, or a link that leads
 * anywhere else is not.
 * @param {string} at
 * @returns {boolean}
 */
export function isFolderOrLinkToOne(at) {
  const st = fs.lstatSync(at, {throwIfNoEntry: false});
  if (!st) return false;
  return (
    st.isDirectory() ||
    (st.isSymbolicLink() &&
      Boolean(fs.statSync(at, {throwIfNoEntry: false})?.isDirectory()))
  );
}

/** Files a system or a tool puts in any folder; a folder of only these is empty. */
export const FOLDER_JUNK = new Set([
  '.DS_Store',
  '.gitkeep',
  'Thumbs.db',
  'desktop.ini',
]);

/**
 * Whether `dir` holds nothing of anyone's: absent, empty, or only system
 * files (what `git rm -r` or a branch switch leaves). A path that is not a
 * folder, or one that does not read, is not empty.
 * @param {string} dir
 * @returns {boolean}
 */
export function folderIsEmpty(dir) {
  // (A link is never followed: one that leads nowhere is not absent.)
  if (!fs.lstatSync(dir, {throwIfNoEntry: false})) return true;
  try {
    // A folder holding only empty folders (an empty tokens/) holds nothing
    // either; a link is never followed.
    return (
      fs.lstatSync(dir).isDirectory() &&
      fs
        .readdirSync(dir)
        .every(
          n =>
            FOLDER_JUNK.has(n) ||
            (fs.lstatSync(path.join(dir, n)).isDirectory() &&
              folderIsEmpty(path.join(dir, n))),
        )
    );
  } catch {
    return false;
  }
}
