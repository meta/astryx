// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The most one progressive docs read may return.
 *
 * @input Docs payloads: one topic's section index, or one section.
 * @output Their size in bytes as `--json` prints them, and the sections over
 *   the budget.
 * @position Shared by Doctor's docs checks and the authoring self-doc audit, so
 *   both hold every read to the same limit.
 */

import {sectionKey} from './docs-section-key.mjs';
import {
  DOC_OUTPUT_BUDGET_BYTES,
  docPayloadBytes,
} from '../response/docs-read-budget.mjs';

export {DOC_OUTPUT_BUDGET_BYTES, docPayloadBytes};

/**
 * @param {Omit<import('../../api/docs/docs.type.mjs').DocsIndex, 'links' | 'sections'> & {sections: import('../../api/docs/docs.type.mjs').DocsIndexEntry[], links?: import('../../api/docs/docs.type.mjs').DocsLinks}} index
 *   an index, with or without its links; its sections may or may not name their package
 * @returns {number}
 */
export function docsIndexBytes(index) {
  return docPayloadBytes({type: 'docs.index', data: index});
}

/**
 * The sections a single read would return more than `budget` bytes for.
 * @param {any[]} sections
 * @param {number} [budget]
 * @returns {{key: string, title: string, bytes: number}[]}
 */
export function oversizedDocSections(
  sections,
  budget = DOC_OUTPUT_BUDGET_BYTES,
) {
  return sections
    .map(section => ({
      key: sectionKey(section),
      title: section.title,
      bytes: docPayloadBytes({type: 'docs.detail.section', data: section}),
    }))
    .filter(entry => entry.bytes > budget);
}
