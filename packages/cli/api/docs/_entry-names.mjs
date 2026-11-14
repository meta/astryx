// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The names `astryx docs` reads in a project: every route of the
 * project's docs tree, namespaces and flat topics included, kept between runs.
 *
 * @input a project folder
 * @output the routes, in tree order
 * @position api/docs: given by the component, hook and template lookups to
 *   the not-found hint (foundation/suggest/other-command.mjs). It imports the
 *   docs adapter only when the kept routes cannot be read back.
 */

import {persistedGather} from '../../foundation/fs/gather-cache.mjs';
import {EXACT_CODEC} from '../../foundation/fs/exact-codec.mjs';
import {CLI_ROOT, realDir} from '../../foundation/fs/paths.mjs';
import {hostedRun} from '../../foundation/runtime/package-root.mjs';

/** The kept routes, with the shape they need. */
const ROUTES_CODEC = {
  ...EXACT_CODEC,
  valid: (/** @type {unknown} */ value) =>
    Array.isArray(value) && value.every(route => typeof route === 'string'),
};

/**
 * Every route `astryx docs <route>` reads in the project at `cwd`, in tree
 * order. An experimental doc is left out: it answers only to the route its
 * project marks, never to a name a reader types for something else.
 * @param {string} cwd
 * @returns {Promise<string[]>}
 */
export async function docsEntryNames(cwd) {
  // A function of the files the tree reads, which the kept gather stamps: a
  // later run with every one unchanged reads the routes back.
  return /** @type {string[]} */ (
    await persistedGather(
      [
        'docs-entry-names',
        realDir(cwd),
        CLI_ROOT,
        hostedRun()?.integrations ?? [],
      ],
      () => docsEntryNamesNow(cwd),
      ROUTES_CODEC,
    )
  );
}

/**
 * docsEntryNames, worked out now.
 * @param {string} cwd
 * @returns {Promise<string[]>}
 */
async function docsEntryNamesNow(cwd) {
  const [{loadDocsCatalog, projectTree}, {isExperimentalTreeNode}] =
    await Promise.all([
      import('./_adapter.mjs'),
      import('../../foundation/doc-compiler/tree.mjs'),
    ]);
  const tree = await projectTree(await loadDocsCatalog(cwd));
  return [...tree.nodes.values()]
    .filter(node => !isExperimentalTreeNode(tree, node))
    .map(node => node.route);
}
