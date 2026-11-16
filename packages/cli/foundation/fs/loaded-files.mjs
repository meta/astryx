// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The files of the CommonJS code a module loaded, and their stamps
 *   for a kept answer that code worked out.
 * @input Module files already loaded by `require`.
 * @output `loadedFiles(roots)`, every file in the require graph from
 *   `roots`; `loadedFileStamps(files)`, their stamps and whether each last
 *   changed before this process started.
 * @position For a kept answer worked out by a library (Babel's compile of a
 *   theme's local module, css-tree's checks of a theme's keys): its stamps
 *   name every file of the library's code, wherever it is installed, so a
 *   reinstall that changes any of them works the answer out again.
 */

import {createRequire} from 'node:module';
import {fileStamp} from './read-record.mjs';

/**
 * Every file in the require graph from `roots`: each root, if loaded, and
 * every module a loaded module required, wherever it is installed.
 * @param {string[]} roots module files, as `require.resolve` gives them
 * @returns {string[]}
 */
export function loadedFiles(roots) {
  const {cache} = createRequire(import.meta.url);
  /** @type {Set<string>} */
  const found = new Set();
  /** @param {NodeJS.Module | undefined} module */
  const visit = module => {
    if (!module || found.has(module.filename)) return;
    found.add(module.filename);
    for (const child of module.children) visit(child);
  };
  for (const root of roots) visit(cache[root]);
  return [...found];
}

/**
 * Each of `files` with its full stamp, and whether every one last changed
 * before this process started. The code a process runs is what its files
 * held when it loaded them, and a file unchanged since before the process
 * started holds that code still, whenever the process loaded it; an answer
 * that code worked out is kept only then.
 * @param {string[]} files
 * @returns {{stamps: [string, string][], unchangedSinceStart: boolean}}
 */
export function loadedFileStamps(files) {
  const started = performance.timeOrigin;
  /** @type {[string, string][]} */
  const stamps = files.map(file => [file, fileStamp(file)]);
  const unchangedSinceStart = stamps.every(([, stamp]) => {
    if (stamp === '-') return false;
    const [, mtime, ctime] = stamp.split(':').map(Number);
    return mtime < started && ctime < started;
  });
  return {stamps, unchangedSinceStart};
}
