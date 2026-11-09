// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Removal of a node-project run's folder outside every time limit.
 * @input A folder the node project's global setup made for one run.
 * @output `trashFolder(dir)` moves the folder aside and removes it in a
 *   detached child; `sweepTrash(parent, before)` removes trash that an
 *   earlier run's child left behind.
 * @position Used by vitest.global-setup.node.mjs. The suites that unpack the
 *   packed CLI keep thousands of files in the run's folder. Vitest gives
 *   `close()` only 10 s, so the teardown never waits on their removal.
 */

import {spawn} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** A trash folder's name: the run folder's name and the time it moved. */
const TRASH_NAME = /^astryx-cli-tarball-.+\.trash-(\d+)$/u;

/**
 * Remove `target` in a detached child that outlives this process.
 * @param {string} target
 * @returns {import('node:child_process').ChildProcess}
 */
function removeInBackground(target) {
  const child = spawn(
    process.execPath,
    [
      '-e',
      "require('node:fs').rmSync(process.argv[1], {recursive: true, force: true, maxRetries: 3})",
      target,
    ],
    {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      // A debugger flag in NODE_OPTIONS would otherwise attach to the child.
      env: {...process.env, NODE_OPTIONS: ''},
    },
  );
  child.unref();
  return child;
}

/**
 * Move `dir` aside on its own file system, which takes no time, and remove
 * it in a detached child. Where the move fails, as with an open handle on
 * Windows, the child removes `dir` where it is.
 * @param {string} dir
 * @returns {import('node:child_process').ChildProcess | null} the child, or
 *   null when there is no `dir`
 */
export function trashFolder(dir) {
  if (!fs.existsSync(dir)) return null;
  const trash = `${dir}.trash-${Date.now()}`;
  try {
    fs.renameSync(dir, trash);
  } catch {
    return removeInBackground(dir);
  }
  return removeInBackground(trash);
}

/**
 * Remove the trash folders in `parent` that moved before `before`, as when
 * an earlier run's child was stopped. A later run's trash is left to its own
 * child.
 * @param {string} parent
 * @param {number} before - a time in milliseconds since the epoch
 * @returns {import('node:child_process').ChildProcess[]} one child per folder
 */
export function sweepTrash(parent, before) {
  return fs.readdirSync(parent).flatMap(entry => {
    const moved = TRASH_NAME.exec(entry);
    if (!moved || Number(moved[1]) >= before) return [];
    return [removeInBackground(path.join(parent, entry))];
  });
}
