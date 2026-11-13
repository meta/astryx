// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The kinds of places a block template goes: one vocabulary that page
 * templates name their slots with and block templates name their fit with.
 * @input none; plain data.
 * @output {@link SLOT_KINDS}, and helpers that read it.
 * @position authoring/doctypes/template; the template doc type, the template
 *   doc schema doc, template discovery, `astryx build` and the integration
 *   checks read it.
 *
 * Kinds are in three groups. A region is a place in a page's layout. A
 * section is a part of a page's body, named by what it holds. A context is
 * not a place in the page: an overlay opens above it from a trigger, and an
 * inline piece goes inside another piece. Only regions and sections are page
 * slots.
 */

/** @typedef {import('./type.js').TemplateSlotKind} TemplateSlotKind */

/**
 * @typedef {object} SlotKindInfo
 * @property {TemplateSlotKind} kind
 * @property {'region' | 'section' | 'context'} group
 * @property {string} summary what goes in a place of this kind
 */

/** @type {readonly SlotKindInfo[]} */
export const SLOT_KINDS = Object.freeze([
  {
    kind: 'navigation',
    group: 'region',
    summary:
      'Moves people between pages or views.',
  },
  {
    kind: 'header',
    group: 'region',
    summary:
      'The top of a page or section.',
  },
  {
    kind: 'toolbar',
    group: 'region',
    summary:
      'Controls that act on the content next to them.',
  },
  {
    kind: 'main',
    group: 'region',
    summary:
      'The page body. Every block that goes in a page fits it; a page names its parts with section kinds where it can.',
  },
  {
    kind: 'panel',
    group: 'region',
    summary:
      'A side region next to the main content.',
  },
  {
    kind: 'footer',
    group: 'region',
    summary:
      'The bottom of a page or section.',
  },
  {
    kind: 'metrics',
    group: 'section',
    summary: 'Headline numbers.',
  },
  {
    kind: 'chart',
    group: 'section',
    summary:
      'Plotted data.',
  },
  {
    kind: 'table',
    group: 'section',
    summary: 'Records in rows and columns.',
  },
  {
    kind: 'list',
    group: 'section',
    summary:
      'A collection of items.',
  },
  {
    kind: 'form',
    group: 'section',
    summary: 'Data entry and its submit actions.',
  },
  {
    kind: 'content',
    group: 'section',
    summary:
      'Things to read or look at.',
  },
  {
    kind: 'feedback',
    group: 'section',
    summary:
      'Messages about state.',
  },
  {
    kind: 'chat',
    group: 'section',
    summary: 'A conversation.',
  },
  {
    kind: 'overlay',
    group: 'context',
    summary:
      'Opens above the page from a trigger.',
  },
  {
    kind: 'inline',
    group: 'context',
    summary:
      'Goes inside another piece.',
  },
]);

/** Each kind's entry, by kind. */
const BY_KIND = new Map(SLOT_KINDS.map(entry => [entry.kind, entry]));

/**
 * Whether a value is a kind this vocabulary has. A template from a newer
 * release can name a kind an older one does not know; readers skip it.
 * @param {unknown} kind
 * @returns {kind is TemplateSlotKind}
 */
export function isSlotKind(kind) {
  return typeof kind === 'string' && BY_KIND.has(/** @type {any} */ (kind));
}

/**
 * Whether a place of this kind is in the page: a region or a section. An
 * overlay and an inline piece are contexts, which no page slot holds.
 * @param {string} kind
 */
export function isPageKind(kind) {
  const group = BY_KIND.get(/** @type {any} */ (kind))?.group;
  return group === 'region' || group === 'section';
}

/**
 * Whether a slot of `slotKind` takes a block that fits `fitKind`: the same
 * kind, or the page body (`main`) for any kind that goes in a page.
 * @param {string} slotKind
 * @param {string} fitKind
 */
export function slotTakes(slotKind, fitKind) {
  if (!isPageKind(slotKind) || !isPageKind(fitKind)) return false;
  return slotKind === fitKind || slotKind === 'main';
}
