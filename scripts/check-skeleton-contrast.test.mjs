// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Skeleton placeholder visibility guard.
 *
 * Skeleton paints `--color-skeleton` and pulses its opacity up to 0.925.
 * At that peak the placeholder must read against the page and the surfaces
 * it sits on: at least 1.2:1 against `--color-background-body`,
 * `--color-background-surface` and `--color-background-card`, in both
 * colour schemes, for every first-party theme.
 *
 * @input The first-party theme objects, through scripts/lib/theme-contrast.
 * @output Fails when a theme's skeleton at the pulse peak drops below 1.2:1
 *   against its page or a surface.
 * @position Repo-level guard, sibling of the other scripts/check-*.
 */

import {describe, expect, it} from 'vitest';
import {
  FIRST_PARTY_THEMES,
  MODES,
  resolveColor,
  themeTokens,
} from './lib/theme-contrast.mjs';
import {contrastRatio} from '../packages/core/src/theme/contrast.ts';
import {parseColor} from '../packages/core/src/utils/color.ts';

/** The highest opacity Skeleton's pulse reaches. */
const PULSE_PEAK = 0.925;
const MIN_RATIO = 1.2;
const BACKGROUNDS = [
  '--color-background-body',
  '--color-background-surface',
  '--color-background-card',
];

function rows() {
  const out = [];
  for (const [themeName, theme] of Object.entries(FIRST_PARTY_THEMES)) {
    const tokens = themeTokens(theme);
    for (let modeIndex = 0; modeIndex < MODES.length; modeIndex++) {
      const skeleton = resolveColor(
        tokens['--color-skeleton'],
        tokens,
        modeIndex,
      );
      for (const token of BACKGROUNDS) {
        const background = resolveColor(tokens[token], tokens, modeIndex);
        const row = {
          theme: themeName,
          mode: MODES[modeIndex],
          token,
          skeleton,
          background,
          ratio: null,
        };
        if (skeleton && background) {
          const peak = {...parseColor(skeleton), a: PULSE_PEAK};
          row.ratio = contrastRatio(peak, background);
        }
        out.push(row);
      }
    }
  }
  return out;
}

describe('skeleton placeholder visibility', () => {
  const all = rows();
  const label = row => `${row.theme}/${row.mode} skeleton on ${row.token}`;

  it('resolves the skeleton and every background in every first-party theme and mode', () => {
    expect(all.filter(row => row.ratio == null).map(label)).toEqual([]);
    expect(all).toHaveLength(
      Object.keys(FIRST_PARTY_THEMES).length *
        MODES.length *
        BACKGROUNDS.length,
    );
  });

  it('reads at the pulse peak against the page and each surface', () => {
    const failures = all
      .filter(row => row.ratio != null && row.ratio < MIN_RATIO)
      .map(
        row =>
          `${label(row)} ${row.ratio.toFixed(2)}:1 (${row.skeleton} on ${row.background})`,
      );
    expect(failures).toEqual([]);
  });
});
