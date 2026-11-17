// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file docs.list leaf — enumerate the available reference-doc topics.
 *
 * @input The project's doc catalog (built-in topics plus the ones configured
 *   integrations contribute), via the shared adapter. A built-in topic's
 *   English `description` is read from its file; a contributed topic already
 *   carries the one discovery read. The listing never applies --dense/--zh
 *   overlays.
 * @output { type: 'docs.list', data: DocsListEntry[] } — one entry per topic
 *   in read order, then one per top-level docs-tree namespace, each naming the
 *   package that owns it, matching `astryx --json docs`.
 * @position Leaf under api/docs. Sibling of detail; both share _adapter.mjs.
 */

import {loadTopicFile} from '../../../foundation/doc-compiler/read.mjs';
import {
  childIdentity,
  holdsOwnName,
  linkDocText,
  loadDocsCatalog,
  projectTree,
} from '../_adapter.mjs';

/**
 * @param {object} [options]
 * @param {string} [options.cwd]
 * @param {number | 'all'} [options.depth] how many levels of the docs tree to
 *   list below each namespace; without it the namespaces list alone, as they
 *   always have
 * @returns {Promise<import('../docs.type.mjs').DocsListResponse>}
 */
export async function list({cwd, depth} = {}) {
  const catalog = await loadDocsCatalog(cwd);
  const tree = await projectTree(catalog);
  /** @type {Array<import('../docs.type.mjs').DocsListEntry>} */
  const entries = [];
  for (const entry of catalog.entries()) {
    // A topic whose name opens another doc is not listed (spec:AST-046
    // FR11); `astryx doctor` names the clash.
    if (!holdsOwnName(tree, catalog, entry)) continue;
    let description = entry.description ?? '';
    if (entry.description == null) {
      const file = await loadTopicFile(entry.path, null);
      description = file.doc?.description ?? '';
    }
    /** @type {import('../docs.type.mjs').DocsListEntry} */
    const listed = {
      topic: entry.name,
      // A link in the description reads as the command that opens its doc.
      description: await linkDocText(
        catalog,
        entry.providerId ?? entry.package,
        description,
      ),
      package: entry.package,
    };
    if (entry.replaces != null) {
      listed.replaces = entry.replaces;
      // INV28: the package whose topic it replaced, beside its own.
      if (entry.replacedPackage != null) {
        listed.replacedPackage = entry.replacedPackage;
      }
    }
    entries.push(listed);
  }
  // The docs tree's top-level namespaces, the CLI's and each integration's,
  // each the way into a whole branch (spec:AST-046 FR7). They go in `meta`,
  // so `data` stays the topic list 0.6 returned: every entry reads as a topic.
  // With `depth`, each one also carries the branch below it, so one read
  // learns every route: without it a reader knows only that the namespace is
  // there, and the children it must name are invisible until it opens each one.
  const levels = depthLevels(depth);
  const namespaces = tree.roots().map(root => branch(tree, root, levels));
  /** @type {NonNullable<import('../docs.type.mjs').DocsListResponse['meta']>} */
  const meta = {};
  if (namespaces.length > 0) meta.namespaces = namespaces;
  // A package whose docs did not load is named, so its author knows why its
  // topics are missing.
  if (catalog.issues.length > 0) meta.notLoaded = [...catalog.issues];
  return Object.keys(meta).length === 0
    ? {type: 'docs.list', data: entries}
    : {type: 'docs.list', data: entries, meta};
}

/**
 * How many levels below each namespace the list carries: none without
 * `depth`, every level for `'all'`. `docs <namespace> --depth` reads the same
 * way, so one flag means one thing everywhere.
 * @param {number | 'all'} [depth]
 * @returns {number | null} null for a list read with no depth, which carries
 *   the namespaces alone
 */
function depthLevels(depth) {
  if (depth == null) return null;
  return depth === 'all' ? Infinity : depth;
}

/**
 * One namespace of the list, with the branch below it to `levels`. A child
 * reads exactly as a namespace read gives it (`childIdentity`): the route
 * that opens it, and the package that owns it — the integration's, for a
 * guide an integration replaced, with the package whose route it took beside
 * it. Every line of the list is then an argument a reader can pass straight
 * back to `astryx docs`, attributed the way the read attributes it. Where the
 * depth stops on a doc with docs below it, the row says how many, as a
 * namespace read's child does; `levels` of null is a read with no depth,
 * which says nothing about what is below.
 * @param {import('../../../foundation/doc-compiler/tree.mjs').DocsTree} tree
 * @param {import('../../../foundation/doc-compiler/tree.mjs').TreeNode} node
 * @param {number | null} levels
 * @returns {import('../docs.type.mjs').DocsListNamespace}
 */
function branch(tree, node, levels) {
  /** @type {import('../docs.type.mjs').DocsListNamespace} */
  const listed = {
    topic: node.route,
    description: node.summary,
    package: node.provider,
  };
  if (levels == null) return listed;
  const below = node.slots.flatMap(slot => slot.children);
  if (levels <= 0) {
    if (below.length > 0) listed.childCount = below.length;
    return listed;
  }
  const children = below
    .map(route => tree.get(route))
    .filter(child => child != null)
    .map(child => {
      const node = /** @type {import('../../../foundation/doc-compiler/tree.mjs').TreeNode} */ (
        child
      );
      const {topic: _route, ...rest} = branch(tree, node, levels - 1);
      const identity = childIdentity(tree, node);
      return /** @type {import('../docs.type.mjs').DocsListChild} */ ({
        ...identity,
        topic: identity.route,
        description: identity.summary,
        ...(rest.children ? {children: rest.children} : {}),
        ...(rest.childCount ? {childCount: rest.childCount} : {}),
      });
    });
  if (children.length > 0) listed.children = children;
  return listed;
}
