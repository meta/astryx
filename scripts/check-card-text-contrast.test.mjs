// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Card and page text contrast guard.
 *
 * Text on the page and on each card fill must meet WCAG 2.2 AA by role
 * (success criteria 1.4.3 Contrast (Minimum) and 1.4.11 Non-text Contrast):
 * 4.5:1 for body text, 3:1 for large text and non-text UI. Card titles,
 * body copy, labels and secondary text are body-size text, so each needs
 * 4.5:1. For every first-party theme and both colour schemes this checks
 * `--color-text-primary` and `--color-text-secondary` against the page
 * (`--color-background-body`), the default card, the muted card and every
 * coloured card fill, with the card variant's own token overrides applied.
 *
 * @input The first-party theme objects, through scripts/lib/theme-contrast.
 * @output Fails when a text role reads below its WCAG AA ratio on the page
 *   or on a card fill.
 * @position Repo-level guard, sibling of the other scripts/check-*.
 */

import {describe, expect, it} from 'vitest';
import {
  FIRST_PARTY_THEMES,
  MODES,
  layeredContrast,
  resolveColor,
  themeTokens,
} from './lib/theme-contrast.mjs';

/** WCAG 2.2 AA minimum contrast by role (SC 1.4.3 and 1.4.11). */
const WCAG_AA = {bodyText: 4.5, largeText: 3, nonText: 3};

/** The text roles drawn on the page and in cards: both body-size text. */
const TEXT_ROLES = {
  '--color-text-primary': WCAG_AA.bodyText,
  '--color-text-secondary': WCAG_AA.bodyText,
};

/** Card variants and the fill token Core's Card paints for each. */
const CARD_FILLS = {
  default: '--color-background-card',
  muted: '--color-background-muted',
  blue: '--color-background-blue',
  cyan: '--color-background-cyan',
  gray: '--color-background-gray',
  green: '--color-background-green',
  orange: '--color-background-orange',
  pink: '--color-background-pink',
  purple: '--color-background-purple',
  red: '--color-background-red',
  teal: '--color-background-teal',
  yellow: '--color-background-yellow',
};

/** The tokens a theme's card rule sets for a variant, over its base rule. */
function cardOverrides(theme, variant) {
  const card = theme.components?.card ?? {};
  return {...card.base, ...card[`variant:${variant}`]};
}

function rows() {
  const out = [];
  for (const [themeName, theme] of Object.entries(FIRST_PARTY_THEMES)) {
    const page = themeTokens(theme);
    for (let modeIndex = 0; modeIndex < MODES.length; modeIndex++) {
      const body = resolveColor(
        page['--color-background-body'],
        page,
        modeIndex,
      );
      const grounds = [{where: 'page', tokens: page, layers: [body]}];
      for (const [variant, fill] of Object.entries(CARD_FILLS)) {
        const tokens = themeTokens(theme, cardOverrides(theme, variant));
        const color = resolveColor(tokens[fill], tokens, modeIndex);
        if (color == null) continue;
        // A see-through fill shows the page under it.
        grounds.push({where: `${variant} card`, tokens, layers: [color, body]});
      }
      for (const {where, tokens, layers} of grounds)
        for (const [role, needs] of Object.entries(TEXT_ROLES)) {
          const text = resolveColor(tokens[role], tokens, modeIndex);
          out.push({
            theme: themeName,
            mode: MODES[modeIndex],
            where,
            role,
            needs,
            text,
            layers,
            ratio:
              text && layers.every(Boolean)
                ? layeredContrast(text, layers, modeIndex)
                : null,
          });
        }
    }
  }
  return out;
}

describe('text on the page and on card fills', () => {
  const all = rows();
  const label = row => `${row.theme}/${row.mode} ${row.role} on ${row.where}`;

  it('resolves every text role and fill in every first-party theme and mode', () => {
    expect(all.filter(row => row.ratio == null).map(label)).toEqual([]);
  });

  it('meets WCAG AA for its role on the page and on each card fill', () => {
    const failures = all
      .filter(row => row.ratio != null && row.ratio < row.needs)
      .map(
        row =>
          `${label(row)} ${row.ratio.toFixed(2)}:1, needs ${row.needs}:1 (${row.text} on ${row.layers[0]})`,
      );
    expect(failures).toEqual([]);
  });
});
