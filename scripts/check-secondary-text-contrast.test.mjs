// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Secondary-text contrast guard for every first-party theme.
 *
 * `--color-text-secondary` is normal-size text across core components, on the
 * theme's own page backgrounds: the body, the surface, and a card. This
 * requires 4.5:1 on each of them in both colour schemes, so a theme cannot
 * ship secondary text that fails wherever it is used.
 *
 * @input The first-party theme objects.
 * @output Fails when secondary text drops below 4.5:1 on a page background.
 * @position Repo-level theme contrast guard, sibling of the other scripts/check-*.
 */

import {describe, expect, it} from 'vitest';
import {
  AA_NORMAL,
  FIRST_PARTY_THEMES,
  MODES,
  layeredContrast,
  resolveColor,
  themeTokens,
} from './lib/theme-contrast.mjs';

const PAGE_BACKGROUNDS = [
  '--color-background-body',
  '--color-background-surface',
  '--color-background-card',
];

// Known gaps, each for its own theme fix. A pair leaves this list when it
// passes, and the last test fails until it does.
const KNOWN_GAPS = new Set([
  // Chocolate light secondary text is under 4.5:1 (WCAG 1.4.3) on its own
  // backgrounds; its colour is an owner decision.
  'chocolate light on --color-background-surface',
  'chocolate light on --color-background-body',
  'chocolate light on --color-background-card',
]);

function measurements() {
  const rows = [];
  for (const [themeName, theme] of Object.entries(FIRST_PARTY_THEMES)) {
    const tokens = themeTokens(theme);
    MODES.forEach((mode, modeIndex) => {
      const text = resolveColor(
        'var(--color-text-secondary)',
        tokens,
        modeIndex,
      );
      for (const page of PAGE_BACKGROUNDS) {
        const pageColor = resolveColor(`var(${page})`, tokens, modeIndex);
        rows.push({
          theme: themeName,
          mode,
          page,
          ratio:
            text && pageColor
              ? layeredContrast(text, [pageColor], modeIndex)
              : null,
        });
      }
    });
  }
  return rows;
}

const pairName = row => `${row.theme} ${row.mode} on ${row.page}`;

describe('secondary-text contrast on every theme background', () => {
  const rows = measurements();

  it('resolves every theme, mode, and page background', () => {
    expect(rows.filter(row => row.ratio == null)).toEqual([]);
  });

  it('meets WCAG AA for normal text', () => {
    const failures = rows
      .filter(row => !KNOWN_GAPS.has(pairName(row)))
      .filter(row => row.ratio != null && row.ratio < AA_NORMAL)
      .map(row => `${pairName(row)}: ${row.ratio.toFixed(2)}:1`);
    expect(failures).toEqual([]);
  });

  it('lists only gaps that still fail', () => {
    const fixed = rows
      .filter(row => KNOWN_GAPS.has(pairName(row)))
      .filter(row => row.ratio != null && row.ratio >= AA_NORMAL)
      .map(pairName);
    expect(fixed).toEqual([]);
  });
});
