// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every component doc under a Core `src`, read once per process.
 *
 * @input  a Core `src` directory
 * @output each `.doc.mjs` under it, in the order a depth-first walk lists them
 *         (each folder as `readdirSync` lists it, without `node_modules` and
 *         `__tests__`), with its checked doc or the error reading it threw
 * @position packages/cli/foundation/discovery — read by the views of Core's
 *           docs that theme build checks a theme against: the theming targets
 *           (theming-targets.mjs), and the known visual-prop values and the
 *           owners a variant map augments (api/theme/build/build.mjs). A
 *           process reads each doc once for all of them, and reads them again
 *           after a folder or doc it read changes. The docs are shared: a
 *           reader never changes them.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {reusedWhileUnchanged} from '../fs/read-record.mjs';
import {loadComponentDoc} from './component-loader.mjs';

const SKIP_DIRS = new Set(['node_modules', '__tests__']);

/**
 * One component doc under a Core `src`.
 * @typedef {object} CoreComponentDoc
 * @property {string} file - the doc's path, under the real path of `src`
 * @property {any} [doc] - the checked doc, when it read
 * @property {unknown} [error] - what reading it threw, when it did not
 */

/**
 * The read of each Core `src`, by its real path.
 * @type {Map<string, () => Promise<CoreComponentDoc[]>>}
 */
const reads = new Map();

/**
 * Every component doc under `coreSrc`, as {@link loadComponentDoc} reads it.
 * A `src` reached through a symlink, as a project's node_modules reaches Core,
 * shares the read of its real path. A process reuses the read while every
 * folder and doc it read is unchanged.
 * @param {string} coreSrc - absolute path to `<core>/src`
 * @returns {Promise<CoreComponentDoc[]>}
 */
export function coreComponentDocs(coreSrc) {
  const real = fs.realpathSync(coreSrc);
  let read = reads.get(real);
  if (read == null) {
    read = reusedWhileUnchanged(() => readAll(real));
    reads.set(real, read);
  }
  return read();
}

/**
 * @param {string} src - real path to `<core>/src`
 * @returns {Promise<CoreComponentDoc[]>}
 */
async function readAll(src) {
  /** @type {CoreComponentDoc[]} */
  const docs = [];
  /** @param {string} dir */
  const visit = async dir => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await visit(file);
        continue;
      }
      if (!entry.name.endsWith('.doc.mjs')) continue;
      try {
        docs.push({file, doc: await loadComponentDoc(file)});
      } catch (error) {
        docs.push({file, error});
      }
    }
  };
  await visit(src);
  return docs;
}
