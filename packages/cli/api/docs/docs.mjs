// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Programmatic API for the docs command.
 *
 * Dispatcher + barrel. `docs()` routes by argument shape into one of five
 * leaves, each projecting into a single { type, data } envelope:
 *
 *   docs()                                -> list    -> docs.list
 *   docs(topic)                           -> detail  -> docs.detail
 *   docs(topic, undefined, {index: true}) -> index   -> docs.index
 *   docs(topic, section)                  -> section -> docs.detail.section
 *   docs(route)                           -> node    -> docs.node
 *   docs(route, undefined, {depth: 2})    -> node    -> docs.node, two levels
 *
 * A topic read returns the whole doc, as it always has; `index` returns its
 * sections, so a reader can open one by its key (spec:AST-047). The CLI's text
 * view lists the sections by default. A route names a node
 * of the docs tree (spec:AST-046): a namespace lists its children, a guide the
 * tree places reads like any topic, and a typed doc prints its content. The
 * leaves
 * live in list/, index/, detail/, detail/section/, and node/; the discovery,
 * overlay loading, and resolution they share sit in _adapter.mjs.
 */

import {list as listRead} from './list/list.mjs';
import {index as indexRead} from './index/index.mjs';
import {detail as detailRead} from './detail/detail.mjs';
import {
  namespaceSection,
  section as sectionRead,
} from './detail/section/section.mjs';
import {node as nodeRead, nodeView} from './node/node.mjs';
import {resolveDocsArgument} from './_adapter.mjs';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {
  docPackageManager,
  formatCliCommand,
  runWithDocPackageManager,
} from '../../foundation/env/package-manager.mjs';

/**
 * Run a docs read with `{@pm}` steps rendered for the project in `cwd`, the
 * folder the read is about, not the process's working directory. A host that
 * already chose a package manager keeps its choice.
 * @template T
 * @param {string | undefined} cwd
 * @param {() => T} fn
 * @returns {T}
 */
function inProject(cwd, fn) {
  return runWithDocPackageManager(docPackageManager(cwd ?? process.cwd()), fn);
}

/** @type {typeof listRead} */
const list = (options = {}) => inProject(options?.cwd, () => listRead(options));
/** @type {typeof indexRead} */
const index = (topic, options = {}) =>
  inProject(options?.cwd, () => indexRead(topic, options));
/** @type {typeof detailRead} */
const detail = (topic, options = {}) =>
  inProject(options?.cwd, () => detailRead(topic, options));
/** @type {typeof sectionRead} */
const sectionLeaf = (topic, sectionName, options = {}) =>
  inProject(options?.cwd, () => sectionRead(topic, sectionName, options));
/** @type {typeof nodeRead} */
const nodeLeaf = (route, options = {}) =>
  inProject(options?.cwd, () => nodeRead(route, options));

export {list, index, detail, sectionLeaf as section, nodeLeaf as node};

const DETAILS = ['brief', 'compact', 'full'];

/**
 * How far a docs-tree read goes, from the options: `depth` levels below the
 * node, or every level for `'all'`, and `detail` for each doc below it (brief
 * by default). `detail` alone reads one level down. Neither: the plain read.
 * @param {import('./docs.type.mjs').DocsOptions} options
 * @returns {import('./node/node.mjs').DepthRead | undefined}
 */
function depthRead(options) {
  const {depth, detail} = options;
  if (detail != null && !DETAILS.includes(detail)) {
    throw new AstryxError(
      `detail is brief, compact, or full, not ${JSON.stringify(detail)}.`,
      undefined,
      ERROR_CODES.ERR_INVALID_DETAIL,
    );
  }
  if (
    depth != null &&
    depth !== 'all' &&
    !(Number.isInteger(depth) && /** @type {number} */ (depth) >= 0)
  ) {
    throw new AstryxError(
      `depth is a number of levels (0, 1, 2, ...) or "all", not ${JSON.stringify(depth)}.`,
      undefined,
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  if (depth == null && detail == null) return undefined;
  return {
    depth: depth === 'all' ? Infinity : (depth ?? 1),
    detail: /** @type {'brief' | 'compact' | 'full'} */ (detail ?? 'brief'),
    lang: options.lang || (options.dense ? 'dense' : options.zh ? 'zh' : null),
  };
}

/**
 * @param {string} [topic]
 * @param {string} [section]
 * @param {object} [options]
 * @param {string} [options.lang]
 * @param {boolean} [options.zh]
 * @param {boolean} [options.dense]
 * @param {boolean} [options.index] return the topic's section index instead of
 *   the whole doc
 * @param {number | 'all'} [options.depth] how many levels below a docs-tree
 *   namespace to read; a doc with nothing below it reads the same at any depth
 * @param {'brief' | 'compact' | 'full'} [options.detail] how much of each doc
 *   below the named one a depth read returns (brief by default)
 * @param {string} [options.cwd]
 * @returns {Promise<
 *   import('./docs.type.mjs').DocsListResponse |
 *   import('./docs.type.mjs').DocsIndexResponse |
 *   import('./docs.type.mjs').DocsDetailResponse |
 *   import('./docs.type.mjs').DocsDetailSectionResponse |
 *   import('./docs.type.mjs').DocsNodeResponse
 * >}
 */
export async function docs(topic, section, options = {}) {
  return inProject(options.cwd, () => docsRead(topic, section, options));
}

/**
 * The docs read itself, inside its project's package-manager scope.
 * @param {string} [topic]
 * @param {string} [section]
 * @param {any} [options]
 * @returns {Promise<
 *   import('./docs.type.mjs').DocsListResponse |
 *   import('./docs.type.mjs').DocsIndexResponse |
 *   import('./docs.type.mjs').DocsDetailResponse |
 *   import('./docs.type.mjs').DocsDetailSectionResponse |
 *   import('./docs.type.mjs').DocsNodeResponse
 * >}
 */
async function docsRead(topic, section, options = {}) {
  const read = depthRead(options);
  if (!topic) return list(options);
  const found = await resolveDocsArgument(topic, options);
  if (found.kind === 'node') {
    if (section) {
      // A namespace answers a section read from the one guide below it that
      // has the section (spec:AST-046 FR6). A typed doc is one read.
      if (found.node.kind === 'namespace') {
        return namespaceSection(found.tree, found.node, section, options);
      }
      throw new AstryxError(
        `"${found.node.route}" has no sections. Read it whole: ${formatCliCommand(`docs ${found.node.route}`)}.`,
        [{name: found.node.route, reason: found.node.summary}],
        ERROR_CODES.ERR_UNKNOWN_SECTION,
      );
    }
    return {
      type: 'docs.node',
      // The docs tree names each node's npm package as its provider.
      package: found.node.provider,
      data: await nodeView(found.catalog, found.tree, found.node, read),
    };
  }
  if (section) return sectionLeaf(topic, section, options);
  if (options.index) return index(topic, options);
  return detail(topic, options);
}
