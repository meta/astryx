// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The names `astryx docs` reads in a project: every route of the
 * project's docs tree, namespaces and flat topics included.
 *
 * @input a project folder and the integrations it loads
 * @output the routes, in tree order
 * @position api/docs: given by the component, hook and template lookups to
 *   the not-found hint (foundation/suggest/other-command.mjs), loaded only
 *   when the hint asks (./_entry-names-lazily.mjs). Where no
 *   integration adds docs, the routes are the CLI's own, stored at publish
 *   (scripts/generate-docs-routes.mjs); elsewhere they are kept between runs.
 *   The tree is built only when neither answers: in a checkout, or after a
 *   file they depend on changes.
 */

import {fileURLToPath} from 'node:url';
import {
  persistedSummary,
  persistedSummaryAsync,
} from '../../foundation/fs/gather-cache.mjs';
import {fileStamp, recordReads} from '../../foundation/fs/read-record.mjs';
import {CLI_ROOT, realDir} from '../../foundation/fs/paths.mjs';
import {
  DOCS_ROUTES_FILE,
  readStore,
} from '../../foundation/doc-compiler/stored-docs.mjs';
import {
  inputPath,
  inputsUnchanged,
} from '../../foundation/discovery/stored-self-audit.mjs';
import {hostedRun} from '../../foundation/runtime/package-root.mjs';

/** The module's own file. */
const OWN_FILE = fileURLToPath(import.meta.url);

/**
 * The modules whose code decides a project's routes from its files: a kept
 * set of routes is kept only while each is unchanged.
 */
const ROUTES_CODE = [
  OWN_FILE,
  fileURLToPath(new URL('./_adapter.mjs', import.meta.url)),
  fileURLToPath(
    new URL('../../foundation/doc-compiler/tree.mjs', import.meta.url),
  ),
  fileURLToPath(
    new URL(
      '../../foundation/doc-compiler/generated-levels.mjs',
      import.meta.url,
    ),
  ),
  fileURLToPath(
    new URL('../../foundation/discovery/docs-discovery.mjs', import.meta.url),
  ),
  fileURLToPath(
    new URL('../../foundation/config/project.mjs', import.meta.url),
  ),
];

/**
 * Every route `astryx docs <route>` reads in the project at `cwd`, in tree
 * order. An experimental doc is left out: it answers only to the route its
 * project marks, never to a name a reader types for something else.
 * @param {string} cwd
 * @param {Array<{docs?: unknown, iconSets?: unknown, name?: string} | null | undefined>} integrations
 *   the integrations the project loads
 * @returns {Promise<string[]>}
 */
export async function docsEntryNames(cwd, integrations) {
  // The docs tree joins an integration's docs and, with the opt-in, its icon
  // sets' definitions; without either, the project's tree is the CLI's own.
  if (integrations.every(each => !each?.docs && !each?.iconSets)) {
    return storedCliRoutes() ?? (await cliDocsRoutesNow());
  }
  return keptProjectRoutes(cwd, integrations);
}

/**
 * The CLI's own routes as stored at publish, while every file and folder
 * their tree read is as it was then; else null. The check is kept between
 * runs while none of those paths has a new stamp.
 * @returns {string[] | null}
 */
function storedCliRoutes() {
  return persistedSummary(['cli-docs-routes'], () => {
    /** @type {[string, string][]} */
    const stamps = [
      [OWN_FILE, fileStamp(OWN_FILE)],
      [DOCS_ROUTES_FILE, fileStamp(DOCS_ROUTES_FILE)],
    ];
    /** @type {{inputs: Record<string, string>, value: string[]} | undefined} */
    const stored = readStore(DOCS_ROUTES_FILE).get('routes');
    if (!stored) return {value: null, stamps};
    for (const rel of Object.keys(stored.inputs)) {
      const file = inputPath(CLI_ROOT, rel);
      stamps.push([file, fileStamp(file)]);
    }
    return {
      value: inputsUnchanged(CLI_ROOT, stored.inputs) ? stored.value : null,
      stamps,
    };
  });
}

/**
 * The project's routes, kept between runs while every file and folder the
 * tree read, every path it probed and the code that builds it are unchanged.
 * @param {string} cwd
 * @param {Array<{docs?: unknown, iconSets?: unknown, name?: string} | null | undefined>} integrations
 * @returns {Promise<string[]>}
 */
function keptProjectRoutes(cwd, integrations) {
  return persistedSummaryAsync(
    [
      'docs-entry-names',
      realDir(cwd),
      CLI_ROOT,
      hostedRun()?.integrations ?? [],
      // Which integrations load, and where their docs are, decide what the
      // tree reads.
      integrations.map(each => [
        each?.name ?? null,
        typeof each?.docs === 'string' ? each.docs : null,
        typeof each?.iconSets === 'string' ? each.iconSets : null,
      ]),
      ROUTES_CODE.map(file => [file, fileStamp(file)]),
    ],
    async () => {
      /** @type {Map<string, string>} */
      const seen = new Map();
      const value = await recordReads(seen, () => projectRoutesNow(cwd), {
        exact: true,
      });
      return {
        value,
        // A folder probed is recorded by its identity alone. The full stamp,
        // taken now, is stricter; a change during the read leaves it too
        // young to keep.
        stamps: [...seen].map(([file, state]) => [
          file,
          state.startsWith('dir:') ? fileStamp(file) : state,
        ]),
      };
    },
  );
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
