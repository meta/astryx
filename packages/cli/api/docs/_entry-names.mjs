// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The names `astryx docs` reads in a project: every route of the
 * project's docs tree, namespaces and flat topics included, worked out now.
 *
 * @input a project folder and the integrations it loads
 * @output the routes, in tree order
 * @position api/docs: read by the lookup commands' not-found hint, through
 *   ./_entry-names-lazily.mjs, which keeps them in its name index
 *   (foundation/suggest/name-index.mjs) and reads them here only where no
 *   index is kept (a checkout). Where no
 *   integration adds docs, the routes are the CLI's own, stored at publish
 *   (scripts/generate-docs-routes.mjs) and used while every file their tree
 *   read is unchanged; else the tree is built.
 */

import {CLI_ROOT} from '../../foundation/fs/paths.mjs';
import {
  DOCS_ROUTES_FILE,
  readStore,
} from '../../foundation/doc-compiler/stored-docs.mjs';
import {inputsUnchanged} from '../../foundation/discovery/stored-self-audit.mjs';

/**
 * Every route `astryx docs <route>` reads in the project at `cwd`, in tree
 * order. An experimental doc is left out: it answers only to the route its
 * project marks, never to a name a reader types for something else.
 * @param {string} cwd
 * @param {Array<{docs?: unknown, iconSets?: unknown, name?: string} | null | undefined>} integrations
 *   the integrations the project loads
 * @returns {Promise<string[]>}
 */
export async function docsRoutesNow(cwd, integrations) {
  // The docs tree joins an integration's docs and, with the opt-in, its icon
  // sets' definitions; without either, the project's tree is the CLI's own.
  if (integrations.every(each => !each?.docs && !each?.iconSets)) {
    return storedCliRoutes() ?? (await cliDocsRoutesNow());
  }
  return projectRoutesNow(cwd);
}

/**
 * The CLI's own routes as stored at publish, while every file and folder
 * their tree read is as it was then; else null.
 * @returns {string[] | null}
 */
function storedCliRoutes() {
  /** @type {{inputs: Record<string, string>, value: string[]} | undefined} */
  const stored = readStore(DOCS_ROUTES_FILE).get('routes');
  return stored && inputsUnchanged(CLI_ROOT, stored.inputs)
    ? stored.value
    : null;
}

/**
 * The CLI's own routes, worked out now from its docs tree: what
 * scripts/generate-docs-routes.mjs stores, and the answer where no store is.
 * @returns {Promise<string[]>}
 */
export async function cliDocsRoutesNow() {
  const {builtinCatalog} = await import('./_adapter.mjs');
  return routesOf(builtinCatalog());
}

/**
 * The project's routes, worked out now from its docs tree.
 * @param {string} cwd
 * @returns {Promise<string[]>}
 */
async function projectRoutesNow(cwd) {
  const {loadDocsCatalog} = await import('./_adapter.mjs');
  return routesOf(await loadDocsCatalog(cwd));
}

/**
 * Every route of the catalog's docs tree but an experimental doc's.
 * @param {import('../../foundation/discovery/docs-discovery.mjs').DocsCatalog} catalog
 * @returns {Promise<string[]>}
 */
async function routesOf(catalog) {
  const [{projectTree}, {isExperimentalTreeNode}] = await Promise.all([
    import('./_adapter.mjs'),
    import('../../foundation/doc-compiler/tree.mjs'),
  ]);
  const tree = await projectTree(catalog);
  return [...tree.nodes.values()]
    .filter(node => !isExperimentalTreeNode(tree, node))
    .map(node => node.route);
}
