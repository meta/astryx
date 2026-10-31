// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Search's doc candidates: every topic, section, and docs-tree node,
 * with its titles, prose, and code terms. Imported only by the adapter.
 */

import {
  guideEntry,
  sectionPackageOf,
  loadDocsCatalog,
  lowerTopic,
  projectTree,
  holdsOwnName,
} from '../docs/_adapter.mjs';
import {nodeView} from '../docs/node/node.mjs';
import {
  sectionKey,
  sectionSummary,
} from '../../foundation/discovery/docs-section-key.mjs';
import {sectionProse, codeTerms, headings, plain} from './_doc-text.mjs';
import {loadAuthoringSelfDocs} from '../../foundation/discovery/authoring-self-docs.mjs';

/** @typedef {import('./_lexical.mjs').Candidate} Candidate */

/**
 * Build doc candidates at the grain a reader reads them: each section of a
 * topic, whose command reads just that section; each topic as a whole, whose
 * command lists its sections; and each docs-tree node by its route. The tree's
 * guides split into sections like topics, and its typed docs also match by
 * their own name, so `assertResponse` finds `cli/api/functions/assert-response`.
 *
 * Reads the project's catalog rather than the CLI's own docs directory, so a
 * topic an integration contributed (or replaced) is searchable exactly like a
 * built-in one — otherwise the replacement is served by `astryx docs` but
 * invisible to the command whose job is finding it.
 * @param {string} cwd
 * @returns {Promise<Candidate[]>}
 */
export async function gatherDocs(cwd) {
  /** @type {Candidate[]} */
  const candidates = [];
  // Experimental docs (spec:AST-017 FR27) are never search results: they are
  // read on their own routes, so search answers as it would without them.
  const hidden = new Set(
    (await loadAuthoringSelfDocs()).loaded
      .filter(({doc}) => isExperimentalDoc(doc))
      .map(({doc}) => doc.name),
  );
  let catalog;
  try {
    catalog = await loadDocsCatalog(cwd);
  } catch {
    return candidates;
  }
  let tree = null;
  try {
    tree = await projectTree(catalog);
  } catch {
    // `astryx doctor` reports a tree that fails to build; search still
    // indexes the topics.
  }
  for (const entry of catalog.entries()) {
    // A topic whose name opens another doc (spec:AST-046 FR11) is not
    // offered: every hit's command must open the hit.
    if (tree && !holdsOwnName(tree, catalog, entry)) continue;
    let lowered = null;
    try {
      lowered = await lowerTopic(catalog, entry);
    } catch {
      // A topic that cannot be loaded is reported by the commands that own
      // integration issues; search just cannot index it.
    }
    const read = lowered?.doc ?? null;
    if (isExperimentalDoc(read)) continue;
    const doc =
      read && hidden.size > 0 && Array.isArray(read.sections)
        ? {
            ...read,
            sections: read.sections.filter(
              (/** @type {any} */ section) => !hidden.has(section.id),
            ),
          }
        : read;
    // A flat topic lives in its topic level; its hits say so, and name
    // the package each section came from.
    const home = tree?.get(entry.name);
    const placed = home?.ref?.flatTopic === entry.name ? home : null;
    /** @type {Map<string, string>} */
    const packages = new Map([
      [entry.providerId ?? entry.package, entry.package],
      ...entry.extensions.map(
        ext =>
          /** @type {[string, string]} */ ([
            ext.providerId ?? ext.package,
            ext.package,
          ]),
      ),
    ]);
    candidates.push(
      ...topicCandidates(
        entry.name,
        doc,
        entry.title,
        '',
        placed && tree
          ? [
              ...tree.ancestors(placed).map(a => a.title),
              doc?.title || entry.title || entry.name,
            ].join(' › ')
          : undefined,
        placed ? `astryx docs ${placed.parent}` : undefined,
        entry.package,
        key =>
          packages.get(lowered?.sectionProviders?.[key] ?? '') ?? entry.package,
      ),
    );
  }
  if (tree == null) return candidates;
  for (const node of tree.nodes.values()) {
    // A flat topic is indexed above, as a topic.
    if (node.ref?.flatTopic) continue;
    if (isExperimentalNode(tree, node)) continue;
    // A tree hit names where it lives: its ancestors' titles, then its own.
    const path = [...tree.ancestors(node).map(a => a.title), node.title];
    if (node.kind === 'generic') {
      // A guide an integration replaced or extended names the package that
      // wrote it, and each section the package that wrote that section, as
      // reads do (INV28).
      const entry = guideEntry(node);
      let doc = null;
      /** @type {((key: string) => string) | undefined} */
      let sectionPackage;
      try {
        const lowered = await lowerTopic(catalog, entry);
        doc = lowered.doc;
        sectionPackage = sectionPackageOf(entry, lowered);
      } catch {
        // As above: the owning commands report it.
      }
      candidates.push(
        ...topicCandidates(
          node.route,
          doc,
          node.title,
          node.summary,
          path.join(' › '),
          node.parent == null ? undefined : `astryx docs ${node.parent}`,
          entry.package,
          sectionPackage,
        ),
      );
      continue;
    }
    const selfDoc = /** @type {any} */ (node.ref)?.selfDoc;
    // A typed doc's content is what `astryx docs <route>` prints. The first
    // column of its tables names what the doc defines (an error code, an
    // option, a parameter), so each is a keyword the doc answers to.
    /** @type {any[]} */
    const content = (await nodeView(catalog, tree, node)).content ?? [];
    /** @type {string[]} */
    const defined = [];
    for (const block of content) {
      if (block.type !== 'table' || !Array.isArray(block.rows)) continue;
      for (const row of block.rows)
        if (row[0] != null) defined.push(plain(row[0]));
    }
    candidates.push({
      domain: 'doc',
      name: node.name,
      keywords: [
        node.route.slice(node.route.lastIndexOf('/') + 1),
        ...(Array.isArray(selfDoc?.keywords) ? selfDoc.keywords : []),
        // A namespace doc's own keywords, which it declares for search.
        ...(Array.isArray(node.keywords) ? node.keywords : []),
        ...defined,
        ...codeTerms({content}),
      ],
      _declared: [
        ...(Array.isArray(selfDoc?.keywords) ? selfDoc.keywords : []),
        ...(Array.isArray(node.keywords) ? node.keywords : []),
      ],
      description: node.summary || '',
      prose: sectionProse({title: node.title, content}),
      titles: [node.title],
      _topic: node.route,
      _title: path.join(' › '),
      _command: `astryx docs ${node.route}`,
      _parent:
        node.parent == null ? 'astryx docs' : `astryx docs ${node.parent}`,
      _package: node.provider,
    });
  }
  return candidates;
}

/**
 * Is this doc an experimental surface's (spec:AST-017 FR21)?
 * @param {any} doc
 */
function isExperimentalDoc(doc) {
  return doc?.stability === 'experimental';
}

/**
 * Does this tree node document an experimental surface: a typed doc marked
 * experimental, or anything under an experimental namespace?
 * @param {any} tree
 * @param {any} node
 */
function isExperimentalNode(tree, node) {
  return [...tree.ancestors(node), node].some((/** @type {any} */ each) =>
    isExperimentalDoc(each.ref?.selfDoc),
  );
}

/**
 * The candidates one topic yields: the topic itself, and one per section when
 * it has more than one. A topic's command lists its sections, and a section's
 * command reads only that section, so a hit never costs a whole-topic read.
 * @param {string} name - the topic name, or a placed guide's route
 * @param {any} doc - the lowered topic, or null when it did not load
 * @param {string} [title]
 * @param {string} [summary]
 * @param {string} [path] - where the topic lives in the docs tree, as titles
 *   joined by ` › `; a flat topic is its own title
 * @param {string} [parent] - the command that opens the level above the
 *   topic: its namespace, or the topic level for a flat topic
 * @param {string} [pkg] - the npm package that authored the topic
 * @param {(key: string) => string} [sectionPackage] - the npm package a
 *   section came from: an extension's section names the extension's package
 * @returns {Candidate[]}
 */
function topicCandidates(
  name,
  doc,
  title,
  summary = '',
  path,
  parent,
  pkg,
  sectionPackage,
) {
  /** @type {any[]} */
  const sections = doc?.sections ?? [];
  const docTitle = path || doc?.title || title || name;
  const split = sections.length > 1;
  // A placed guide also answers to its last route segment's words:
  // `quick start` is authoring/quick-start.
  const leaf = name.slice(name.lastIndexOf('/') + 1);
  /** @type {Candidate[]} */
  const out = [
    {
      domain: 'doc',
      name,
      keywords: [
        ...(leaf !== name ? [leaf.replaceAll('-', ' ')] : []),
        ...(doc?.title || title ? [doc?.title || title] : []),
        ...(Array.isArray(doc?.keywords) ? doc.keywords : []),
      ],
      _declared: Array.isArray(doc?.keywords) ? doc.keywords : [],
      description: doc?.description || summary,
      prose: split
        ? sections.map(section => section.title).filter(Boolean)
        : sections.flatMap(sectionProse),
      titles: [
        doc?.title || title || name,
        // A topic read whole answers for the headings inside it.
        ...(split ? [] : sections.flatMap(s => [s.title, ...headings(s)])),
      ].filter(Boolean),
      _topic: name,
      _title: docTitle,
      _command: split ? `astryx docs ${name} --index` : `astryx docs ${name}`,
      ...(parent ? {_parent: parent} : {}),
      ...(pkg ? {_package: pkg} : {}),
    },
  ];
  if (!split) return out;
  for (const section of sections) {
    const key = sectionKey(section);
    out.push({
      domain: 'doc',
      name: key,
      keywords: [
        ...(section.title ? [section.title] : []),
        ...headings(section),
        ...codeTerms(section),
      ],
      description: sectionSummary(section),
      prose: sectionProse(section),
      titles: [section.title, ...headings(section)].filter(Boolean),
      _topic: name,
      _section: key,
      _title: `${docTitle} › ${section.title}`,
      _command: `astryx docs ${name} ${key}`,
      _parent: `astryx docs ${name} --index`,
      ...((sectionPackage?.(key) ?? pkg)
        ? {_package: sectionPackage?.(key) ?? pkg}
        : {}),
    });
  }
  return out;
}
