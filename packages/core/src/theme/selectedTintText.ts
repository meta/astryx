// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file selectedTintText.ts
 * @input A theme's tokens, and the tokens a rule sets over them
 * @output The secondary text colour that reads on the accent tint, per mode,
 *   as the private `--_selected-text-secondary` value
 * @position Theme generation step beside statusRoleDerivation, called by
 *   generateThemeRules for runtime and static output alike; Core's own values
 *   are precomputed in selectedTintText.stylex.ts
 */

import {colorDefaults} from './tokens.stylex';
import {parseConcreteColor, solveLightness, toHex} from './statusColor';
import {opaqueOver as over, resolveModes} from './statusRoleDerivation';
import type {RGBA} from '../utils/color';

/** The private variable every part on the accent tint reads. */
export const SELECTED_TEXT_SECONDARY = '--_selected-text-secondary';

const TEXT_RATIO = 4.5;
// Solve slightly above the floor so rounding to #RRGGBB never lands below it.
const SOLVE_RATIO = TEXT_RATIO + 0.08;

/** The tokens the derivation reads: a theme that sets one gets its own value. */
export const SELECTED_TINT_INPUTS: ReadonlyArray<string> = [
  '--color-text-secondary',
  '--color-accent-muted',
  '--color-overlay-hover',
  '--color-background-body',
  '--color-background-surface',
  '--color-background-card',
];

const WHITE: RGBA = {r: 255, g: 255, b: 255, a: 1};

/** The fill Core's Card paints for each variant (`transparent` paints none). */
export const CARD_FILLS: Readonly<Record<string, string>> = {
  default: '--color-background-card',
  muted: '--color-background-muted',
  ...Object.fromEntries(
    [
      'blue',
      'cyan',
      'gray',
      'green',
      'orange',
      'pink',
      'purple',
      'red',
      'teal',
      'yellow',
    ].map(variant => [variant, `--color-background-${variant}`]),
  ),
};

/**
 * Where the tint is measured. `page`: the page grounds. `fill`: the part's
 * fill only. `fill-and-page`: the fill and the page grounds, for a card that
 * keeps the page's text. `page-and-cards`: the page grounds and every Card
 * variant's fill over them, for a part a rule styles wherever it sits.
 */
export type TintGround =
  | {kind: 'page'}
  | {kind: 'fill'; fill: string}
  | {kind: 'fill-and-page'; fill: string}
  | {kind: 'page-and-cards'};

/** The secondary text on the tint in one mode, or null when not concrete. */
function solveForMode(
  resolved: Record<string, string>,
  where: TintGround,
): RGBA | null {
  const color = (name: string) => parseConcreteColor(resolved[name]);
  const secondary = color('--color-text-secondary');
  const tint = color('--color-accent-muted');
  const hover = color('--color-overlay-hover');
  const body = color('--color-background-body');
  const surface = color('--color-background-surface');
  const card = color('--color-background-card');
  // A see-through secondary text is not one colour to move; the theme's own
  // value stays (generateThemeRules).
  if (
    secondary === null ||
    secondary.a < 1 ||
    tint === null ||
    hover === null ||
    body === null ||
    surface === null ||
    card === null
  ) {
    return null;
  }
  const page = over(body, WHITE);
  const pageSurface = over(surface, page);
  const pages = [page, pageSurface, over(card, pageSurface)];
  let grounds = pages;
  if (where.kind === 'page-and-cards') {
    // A part outside any one Card can sit in a Card of every variant.
    const fills = Object.values(CARD_FILLS).map(color);
    if (fills.some(fill => fill === null)) {
      return null;
    }
    grounds = [
      ...pages,
      ...fills.flatMap(fill => pages.map(ground => over(fill as RGBA, ground))),
    ];
  } else if (where.kind !== 'page') {
    const own = color(where.fill);
    if (own === null) {
      return null;
    }
    // A see-through fill shows what is under it: the page, the surface, or a
    // default card holding this one.
    const fills = pages.map(ground => over(own, ground));
    grounds = where.kind === 'fill' ? fills : [...pages, ...fills];
  }
  const backdrops = grounds.flatMap(ground => {
    const selected = over(tint, ground);
    return [selected, over(hover, selected)];
  });
  return solveLightness(secondary, backdrops, SOLVE_RATIO);
}

/**
 * The `--_selected-text-secondary` value for a theme's tokens with
 * `overrides` set on top (a rule's own tokens), measured on `where`. Null
 * when a colour it reads is not concrete, the secondary text is see-through,
 * or no lightness of it reads there: the caller keeps the theme's own text.
 */
export function deriveSelectedTintText(
  tokens: Record<string, string>,
  localTokens: Record<string, string> = {},
  overrides: Record<string, string> = {},
  where: TintGround = {kind: 'page'},
): string | null {
  const resolved = resolveModes({...localTokens, ...tokens, ...overrides});
  const light = solveForMode(resolved.light, where);
  const dark = solveForMode(resolved.dark, where);
  if (light === null || dark === null) {
    return null;
  }
  return `light-dark(${toHex(light)}, ${toHex(dark)})`;
}

/** Core's own value, from its default tokens. */
export function coreSelectedTintText(): string | null {
  return deriveSelectedTintText(colorDefaults);
}
