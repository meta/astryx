// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The other five theme axes, and the shape a probe needs for each.
 *
 * @input  the theme contract (`defineTheme`) and the registries it accepts
 * @output the non-`components` half of the probe theme
 *
 * `defineTheme` takes six things. The generated component overrides cover one
 * of them, and until this file the other five had no coverage at all: a theme
 * could stop applying its icons, swap the wrong indicator, or lose a token,
 * and every test in the repo would still pass.
 *
 * They are not verifiable the same way, and pretending otherwise is how a
 * check ends up asserting nothing:
 *
 *   tokens      — a CSS custom property. Read it off the themed element and
 *                 compare; no component involvement, so this is exact.
 *   icons       — a component swap keyed by name. The proof is that the
 *                 REPLACEMENT rendered, so the probe swaps in a marked glyph
 *                 and the check looks for the marker.
 *   indicators  — the same, and the one Cindy named: `defineTheme({indicators})`
 *                 replaces the checkbox/radio/check visual everywhere at once.
 *                 A family-checked registry, so a `radio` replacement must
 *                 accept `singleSelection` states.
 *   fonts       — a font-family string; exact, same as a token.
 *   syntax      — a code-token colour map; exact per token, but only renders
 *                 inside a CodeBlock, so it needs a story that has one.
 *
 * Each probe value is deliberately absurd and unique, for the same reason the
 * component overrides are: the question is "did this arrive", not "does this
 * look right", and a value nothing else in the system would produce cannot
 * pass by coincidence.
 */

/** Tokens the probe overrides, chosen to be observable on any themed subtree. */
export const PROBE_TOKENS = {
  '--color-accent': 'rgb(255, 0, 128)',
  '--color-background-body': 'rgb(0, 32, 16)',
  '--color-text-primary': 'rgb(240, 255, 0)',
  '--color-border': 'rgb(0, 224, 255)',
  '--radius-element': '13px',
  '--spacing-4': '17px',
  '--duration-fast': '11ms',
  '--font-size-base': '15.5px',
};

/**
 * The font stack the probe declares. A real family name would be
 * indistinguishable from a fallback; this one can only come from the theme.
 */
export const PROBE_FONT = '"AstryxProbeFace", monospace';

/**
 * Syntax-token colours as the `[light, dark]` pairs `defineSyntaxTheme` takes,
 * one unmistakable value each. Distinct per mode, so a theme that applied the
 * light palette in dark mode is a visible failure rather than a silent one.
 */
export const PROBE_SYNTAX = {
  keyword: ['hsl(0 100% 45%)', 'hsl(0 100% 65%)'],
  string: ['hsl(26 100% 45%)', 'hsl(26 100% 65%)'],
  comment: ['hsl(51 100% 45%)', 'hsl(51 100% 65%)'],
  number: ['hsl(77 100% 45%)', 'hsl(77 100% 65%)'],
  function: ['hsl(103 100% 45%)', 'hsl(103 100% 65%)'],
  type: ['hsl(129 100% 45%)', 'hsl(129 100% 65%)'],
  variable: ['hsl(154 100% 45%)', 'hsl(154 100% 65%)'],
  operator: ['hsl(180 100% 45%)', 'hsl(180 100% 65%)'],
  constant: ['hsl(206 100% 45%)', 'hsl(206 100% 65%)'],
  tag: ['hsl(231 100% 45%)', 'hsl(231 100% 65%)'],
  attribute: ['hsl(257 100% 45%)', 'hsl(257 100% 65%)'],
  property: ['hsl(283 100% 45%)', 'hsl(283 100% 65%)'],
  punctuation: ['hsl(309 100% 45%)', 'hsl(309 100% 65%)'],
  background: ['hsl(334 100% 45%)', 'hsl(334 100% 65%)'],
};

/**
 * `data-*` marker a probe replacement carries.
 *
 * A swap is only proven by the replacement RENDERING. Comparing pixels cannot
 * do it — a themed icon and the default icon can easily paint the same — so
 * the replacement announces itself and the check looks for the announcement.
 */
export const PROBE_SWAP_ATTR = 'data-astryx-probe-swap';

/**
 * Every indicator name the theme contract can swap, with the family whose
 * state space a replacement must accept.
 *
 * Kept as data rather than inlined so the coverage check can say "the contract
 * has an indicator this probe does not swap" instead of silently missing it.
 * <!-- SYNC: packages/core/src/Indicator/types.ts (IndicatorMap) -->
 */
export const PROBE_INDICATORS = {
  check: 'singleSelection',
  radio: 'singleSelection',
  checkbox: 'multiSelection',
};
