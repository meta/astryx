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
  holdsOwnName,
  linkDocText,
  loadDocsCatalog,
  projectTree,
} from '../_adapter.mjs';

/**
 * @param {object} [options]
 * @param {string} [options.cwd]
 * @returns {Promise<import('../docs.type.mjs').DocsListResponse>}
 */
export async function list({cwd} = {}) {
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
  const namespaces = tree.roots().map(root => ({
    topic: root.route,
    description: root.summary,
    package: root.provider,
  }));
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
