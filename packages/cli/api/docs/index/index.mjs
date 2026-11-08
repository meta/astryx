// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file docs.index leaf — the section index of one topic.
 *
 * @input A topic name plus optional {lang, zh, dense, cwd}. Resolves the topic
 *   via the shared adapter and reads its lowered compiled node; nothing is
 *   linked, since the index never inlines a token reference.
 * @output { type: 'docs.index', data: DocsIndex } — the topic's name, title and
 *   description and, for each section, the key it is read by, its title, and a
 *   one-line summary. Matches `astryx --json docs <topic> --index`.
 * @position Leaf under api/docs: a topic's opt-in progressive read. One section
 *   is the section leaf (`docs <topic> <key>`); the whole topic, a plain topic
 *   read, is the detail leaf.
 */

import {indexView} from '../../../foundation/doc-compiler/lenses.mjs';
import {resolveTopicDocs, sectionPackageOf, topicLinks} from '../_adapter.mjs';

/**
 * @param {string} topic
 * @param {object} [options]
 * @param {string} [options.lang]
 * @param {boolean} [options.zh]
 * @param {boolean} [options.dense]
 * @param {string} [options.cwd]
 * @returns {Promise<import('../docs.type.mjs').DocsIndexResponse>}
 */
export async function index(topic, options = {}) {
  const {node, entry, catalog} = await resolveTopicDocs(topic, options);
  const view = indexView(node);
  const sectionPackage = sectionPackageOf(entry, node);
  /** @type {import('../docs.type.mjs').DocsIndex} */
  const data = {
    ...view,
    // A guide the docs tree places is read by its route, not its doc name.
    name: entry.tree ? entry.name : view.name,
    // What it took the place of, and whose that was (INV28).
    ...(entry.replaces != null
      ? {
          replaces: entry.replaces,
          ...(entry.replacedPackage != null
            ? {replacedPackage: entry.replacedPackage}
            : {}),
        }
      : {}),
    // Each section names the package that wrote it: the topic's own, or an
    // extension's.
    sections: view.sections.map(s => ({
      id: s.id,
      title: s.title,
      package: sectionPackage(s.id),
      summary: s.summary,
    })),
    links: await topicLinks(catalog, entry),
  };
  return {type: 'docs.index', package: entry.package, data};
}
