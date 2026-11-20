// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The trait fields `astryx experimental theme create --traits` takes,
 * with what each one takes: the one list the reader (_traits.mjs), its
 * refusals and the command's help read.
 *
 * @position api/theme-edit — pure data
 */

/**
 * Every field, in the order help lists them, with what it takes. The
 * refusal for an unknown field names these.
 */
export const TRAIT_FIELDS = Object.freeze(
  /** @type {const} */ ([
    [
      'look',
      '"light" | "dark" | "both": one look for the app, or a light and a dark look (default "both")',
    ],
    ['page', 'color: the page background'],
    ['surface', 'color: cards, panels and menus'],
    ['text', 'color: the main text'],
    ['accent', 'color: buttons, links, focus and selection'],
    [
      'bar',
      '{"background": color, "text": color}: the app\'s top bar and its own text',
    ],
    [
      'font',
      '{"body", "heading", "code": font names; "size": base text px; "headingWeight", "bodyWeight": 100-900}',
    ],
    ['corners', 'px on buttons and fields (0 = square), or "pill"'],
    ['density', '"compact" | "normal" | "roomy": the spacing'],
    ['borders', '{"width": px, "color": color}'],
    ['shadows', '"none" | "soft" | "strong"'],
    [
      'surfaces',
      '"flat" | "outlined" | "raised": how cards and panels sit on the page',
    ],
    [
      'tokens',
      '{"--token": value | [light, dark]}: exact token values; they win over every field above',
    ],
    [
      'components',
      '{"<part>": {"base" | "<state>": {css}}}: exact part styles; they win over every field above',
    ],
  ]),
);
