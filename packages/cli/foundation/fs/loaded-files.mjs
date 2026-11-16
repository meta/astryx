// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The files of the CommonJS code a module loaded: the module and each
 *   module it required in turn.
 * @input Module files already loaded by `require`.
 * @output `loadedFiles(roots)`, every file in the require graph from `roots`.
 * @position For a kept answer worked out by a library (Babel's compile of a
 *   theme's local module, css-tree's checks of a theme's pseudo keys): its
 *   stamps name every file of the library's code, wherever it is installed,
 *   so a reinstall that changes any of them works the answer out again.
 */

import {createRequire} from 'node:module';

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
