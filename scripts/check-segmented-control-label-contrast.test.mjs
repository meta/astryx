// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SegmentedControl unselected-label contrast guard.
 *
 * An unselected SegmentedControl label is `--color-text-secondary` on the
 * control's track, a `--color-neutral` fill. That fill is often translucent,
 * so the track takes the page behind it: AppShell's surface, the body, or a
 * Card. This flattens the track over each of those backgrounds and resolves
 * the label after the theme's own `segmented-control-item` overrides.
 *
 * @input The first-party theme objects and their `segmented-control-item`
 *   overrides.
 * @output Fails when an unselected label drops below 4.5:1 on any track.
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
  '--color-background-surface',
  '--color-background-body',
  '--color-background-card',
];

// Known gaps, each for its own theme fix. A pair leaves this list when it
// passes, and the last test fails until it does.
const KNOWN_GAPS = new Set([
  // The track lifts the dark card under secondary text (5.99:1 on the card).
  'butter dark on --color-background-card',
  // Chocolate light secondary text is under 4.5:1 (WCAG 1.4.3) on its own
  // backgrounds; its colour is an owner decision.
  'chocolate light on --color-background-surface',
  'chocolate light on --color-background-body',
  'chocolate light on --color-background-card',
]);

function measurements() {
  const rows = [];
  for (const [themeName, theme] of Object.entries(FIRST_PARTY_THEMES)) {
    const pageTokens = themeTokens(theme);
    const labelTokens = themeTokens(
      theme,
      theme.components?.['segmented-control-item']?.base,
    );
    MODES.forEach((mode, modeIndex) => {
      const label = resolveColor(
        'var(--color-text-secondary)',
        labelTokens,
        modeIndex,
      );
      const track = resolveColor('var(--color-neutral)', pageTokens, modeIndex);
      for (const page of PAGE_BACKGROUNDS) {
        const pageColor = resolveColor(`var(${page})`, pageTokens, modeIndex);
        rows.push({
          theme: themeName,
          mode,
          page,
          ratio:
            label && track && pageColor
              ? layeredContrast(label, [track, pageColor], modeIndex)
              : null,
        });
      }
    });
  }
  return rows;
}

const pairName = row => `${row.theme} ${row.mode} on ${row.page}`;

describe('SegmentedControl unselected-label contrast', () => {
  const rows = measurements();

  it('resolves every theme, mode, and page background', () => {
    expect(rows.filter(row => row.ratio == null)).toEqual([]);
  });

  it('meets WCAG AA for normal text on the track over every page background', () => {
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
