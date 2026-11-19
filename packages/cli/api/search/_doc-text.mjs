// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The text search reads from a doc section: its prose, code terms,
 * headings, and table cells as plain words. Imported only by the adapter's
 * gatherers.
 */

import {unlinkText} from '../../foundation/doc-compiler/links.mjs';

/**
 * The words one section says: its prose, headings, and list items.
 * @param {any} section
 * @returns {string[]}
 */
export function sectionProse(section) {
  /** @type {string[]} */
  const prose = [];
  if (section?.title) prose.push(section.title);
  for (const block of section?.content || []) {
    if ((block.type === 'prose' || block.type === 'heading') && block.text) {
      prose.push(block.text);
    } else if (block.type === 'list' && Array.isArray(block.items)) {
      for (const item of block.items) {
        const text = typeof item === 'string' ? item : item?.text;
        if (typeof text === 'string') prose.push(text);
      }
    } else if (block.type === 'table' && Array.isArray(block.rows)) {
      for (const row of block.rows) prose.push(row.map(plain).join(' '));
    } else if (block.type === 'code' && typeof block.code === 'string') {
      prose.push([block.label, block.code].filter(Boolean).join(' '));
    }
  }
  return prose;
}

/**
 * The identifiers a doc part names in code ticks (`token-ref`,
 * `ERR_UNKNOWN_SECTION`). Each is a keyword: a reader who types one exactly
 * wants the part that defines or explains it.
 * @param {any} part - a section, or `{content}` of a typed doc
 * @returns {string[]}
 */
export function codeTerms(part) {
  /** @type {Set<string>} */
  const terms = new Set();
  /** @param {unknown} text */
  const scan = text => {
    for (const m of String(text ?? '').matchAll(/`([^`\s]{2,40})`/g)) {
      terms.add(m[1]);
    }
  };
  for (const block of part?.content || []) {
    if (block.type === 'prose') scan(block.text);
    else if (block.type === 'list' && Array.isArray(block.items)) {
      for (const item of block.items) {
        scan(typeof item === 'string' ? item : item?.text);
      }
    } else if (block.type === 'table' && Array.isArray(block.rows)) {
      for (const row of block.rows) for (const cell of row) scan(cell);
    }
  }
  return [...terms];
}

/**
 * The headings inside a section. Each names a subsection, so a query that
 * names one should find the section as surely as one that names its title.
 * @param {any} section
 * @returns {string[]}
 */
export function headings(section) {
  return (section?.content || [])
    .filter(
      (/** @type {any} */ block) => block.type === 'heading' && block.text,
    )
    .map((/** @type {any} */ block) => String(block.text));
}

/**
 * A table cell as plain words, without its code ticks.
 * @param {unknown} cell
 * @returns {string}
 */
export function plain(cell) {
  return unlinkText(String(cell ?? '')).replaceAll('`', '');
}
