// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Lenses — the docs API's response shapes, read off compiled nodes.
 *
 * @input A compiled reference node from ./compile.mjs: lowered for the index
 *   and for section lookup, linked for anything that inlines token references.
 * @output The `docs.detail` topic, the `docs.index` section index, one
 *   `docs.detail.section` section, and the sections as readers look them up.
 *   Every view is a fresh copy, so a reader may edit what it gets back without
 *   touching the node, which other reads of the same catalog share.
 * @position Between the compiler and api/docs. A lens only projects: it never
 *   loads, merges, overlays, keys, or resolves a reference itself.
 */

import {
  buildDocsIndexData,
  withSourceTitle,
} from '../discovery/docs-section-key.mjs';

/**
 * @param {import('./compile.mjs').CompiledReferenceNode} node
 * @param {any} section
 * @returns {string}
 */
function authoredTitle(node, section) {
  return node.sourceTitles[section.id] ?? section.title;
}

/**
 * The node's sections as readers look them up: each one knows its authored
 * title, so a query in the authoring language finds a translated section.
 * For lookup only; a section a reader gets back comes from
 * {@link sectionView}.
 * @param {import('./compile.mjs').CompiledReferenceNode} node
 * @returns {any[]}
 */
export function readerSections(node) {
  return node.doc.sections.map((/** @type {any} */ section) =>
    withSourceTitle({...section}, authoredTitle(node, section)),
  );
}

/**
 * `docs.detail`: the whole topic, with every token reference inlined.
 * @param {import('./compile.mjs').CompiledReferenceNode} node a linked node
 * @returns {any}
 */
export function detailView(node) {
  if (node.stage !== 'linked') {
    throw new Error(
      `"${node.id}" must be linked before its whole doc is read.`,
    );
  }
  // Assigning `sections` keeps it where the authored doc put it.
  const view = structuredClone({...node.doc, sections: []});
  view.sections = node.doc.sections.map((/** @type {any} */ section) =>
    sectionView(node, section),
  );
  return view;
}

/**
 * `docs.index`: what the topic is, and each section's key, title and summary.
 * The index leaf adds the moves.
 * @param {import('./compile.mjs').CompiledReferenceNode} node
 * @returns {Omit<import('../../api/docs/docs.type.mjs').DocsIndex, 'links' | 'sections'> & {sections: import('../../api/docs/docs.type.mjs').DocsIndexEntry[]}}
 */
export function indexView(node) {
  return buildDocsIndexData(node.doc);
}

/**
 * `docs.detail.section`: one section with its token references and reference
 * blocks inlined, so a read returns only the stable block kinds. A referenced
 * section's content takes the token reference's place; the section takes the
 * preview type of the last reference that has one, unless it has its own. A
 * reference block becomes the content it includes (see referenceView).
 * @param {import('./compile.mjs').CompiledReferenceNode} node
 * @param {any} section a linked section of `node`
 * @returns {any}
 */
export function sectionView(node, section) {
  /** @type {any[]} */
  const content = [];
  /** @type {string | null} */
  let previewType = null;
  for (const block of section.content) {
    if (block?.type === 'reference') {
      content.push(...referenceView(node, block));
      continue;
    }
    if (block?.type !== 'token-ref') {
      content.push(structuredClone(block));
      continue;
    }
    const target = block.resolved;
    if (target == null) {
      throw new Error(
        `The token reference to "${block.topic}" in "${node.id}" was read before it was linked.`,
      );
    }
    if (target.status === 'unknown-topic') {
      content.push({
        type: 'prose',
        text: `[token-ref: unknown topic "${block.topic}"]`,
      });
      continue;
    }
    if (target.status === 'unknown-section') {
      content.push({
        type: 'prose',
        text: `[token-ref: section "${block.section}" not found in "${block.topic}"]`,
      });
      continue;
    }
    // A copy per reference: two references to one section share nothing.
    for (const refBlock of target.content) {
      content.push(structuredClone(refBlock));
    }
    if (target.previewType && !section.previewType) {
      previewType = target.previewType;
    }
  }
  // Assigning `content` keeps it where the section put it; a carried preview
  // type lands after the section's own keys, as it always has.
  const view = structuredClone(
    previewType == null
      ? {...section, content: []}
      : {...section, previewType, content: []},
  );
  view.content = content;
  return withSourceTitle(view, authoredTitle(node, section));
}

/**
 * A reference block as a read shows it (spec:AST-047 FR9): the content it
 * includes, then where that content comes from and the command that opens it.
 * A reference that includes nothing (a summary, or a doc that is not included
 * whole) shows the doc's title and summary; one whose doc is missing says so
 * where its content would be, as a token reference does.
 * @param {import('./compile.mjs').CompiledReferenceNode} node
 * @param {any} block a linked reference block
 * @returns {any[]}
 */
function referenceView(node, block) {
  if (!('link' in block)) {
    throw new Error(
      `The reference to "${block.target}" in "${node.id}" was read before it was linked.`,
    );
  }
  const link = block.link;
  if (link == null) {
    return [
      {type: 'prose', text: `[reference: "${block.target}" names no doc]`},
    ];
  }
  const included = (block.content ?? []).map((/** @type {any} */ each) =>
    structuredClone(each),
  );
  if (included.length === 0) {
    const summary = String(link.summary ?? '').trim();
    const lead =
      summary === ''
        ? link.title
        : `${link.title}: ${summary}${/[.!?]$/.test(summary) ? '' : '.'}`;
    return [{type: 'prose', text: `${lead} Read it with \`${link.command}\`.`}];
  }
  return [
    ...included,
    {type: 'prose', text: `From ${link.title}: \`${link.command}\``},
  ];
}
