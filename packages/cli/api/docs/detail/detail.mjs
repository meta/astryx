// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file docs.detail leaf — load one topic's full reference doc.
 *
 * @input A topic name plus optional {lang, zh, dense, cwd}. Resolves the topic
 *   via the shared adapter and compiles it with its token references linked.
 * @output { type: 'docs.detail', package, data: ReferenceDoc } — the full doc with
 *   token-refs inlined, matching `astryx --json docs <topic>`.
 * @position Leaf under api/docs. Reads the compiled node through the detail
 *   lens; resolution, overlays and extensions happen in the compiler.
 */

import {linkReferenceTopic} from '../../../foundation/doc-compiler/compile.mjs';
import {detailView} from '../../../foundation/doc-compiler/lenses.mjs';
import {
  referenceTargets,
  resolveTopicDocs,
  sectionPackageOf,
  topicLinks,
} from '../_adapter.mjs';

/**
 * @param {string} topic
 * @param {object} [options]
 * @param {string} [options.lang]
 * @param {boolean} [options.zh]
 * @param {boolean} [options.dense]
 * @param {string} [options.cwd]
 * @returns {Promise<import('../docs.type.mjs').DocsDetailResponse>}
 */
export async function detail(topic, options = {}) {
  const {catalog, node, lang, entry} = await resolveTopicDocs(topic, options);
  const linked = await linkReferenceTopic(
    node,
    referenceTargets(catalog, lang),
  );
  const view = detailView(linked);
  const sectionPackage = sectionPackageOf(entry, node);
  return {
    type: 'docs.detail',
    package: entry.package,
    data: {
      ...view,
      // Each section names the package that wrote it: the topic's own, or an
      // extension's.
      sections: view.sections.map(
        (/** @type {import('../docs.type.mjs').DocsReadSection} */ section) => {
          const {id, title, ...rest} = section;
          return {id, title, package: sectionPackage(id), ...rest};
        },
      ),
      // A guide the docs tree places is read by its route, not its doc name.
      ...(entry.tree ? {name: entry.name} : {}),
      // Whose topic or guide it took the place of, beside `replaces` (INV28).
      // What it took the place of, as the list, the index and the listing
      // name it: a guide's route, even when the doc named a route the guide
      // moved from, and a topic replaced twice by the earlier replacement.
      ...(entry.replaces != null ? {replaces: entry.replaces} : {}),
      ...(entry.replaces != null && entry.replacedPackage != null
        ? {replacedPackage: entry.replacedPackage}
        : {}),
      links: await topicLinks(catalog, entry),
    },
  };
}
