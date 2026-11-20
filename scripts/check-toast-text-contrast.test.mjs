// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Toast text contrast: in every first-party theme and color mode, the
 * text a toast card draws (its info and error surfaces) reaches WCAG 2.2 AA
 * for normal-size text, 4.5:1 (SC 1.4.3), on the card.
 * @input The first-party themes, Core's token defaults for the surfaces a
 *   theme does not set, and Toast's side rule (pickInvertedSide).
 * @output A failure naming the theme, mode, surface and ratio.
 * @position Guard for component:Toast FR13 and FR14 across the themes.
 */

import {describe, expect, it} from 'vitest';
import {tokenDefaults} from '../packages/core/dist/theme/index.js';
import {
  AA_NORMAL,
  FIRST_PARTY_THEMES,
  MODES,
  resolveColor,
  themeTokens,
} from './lib/theme-contrast.mjs';
import {withEmittedTokens} from './lib/theme-emitted-tokens.mjs';
import {contrastRatio} from '../packages/core/src/theme/contrast.ts';
import {parseColor} from '../packages/core/src/utils/color.ts';
import {pickInvertedSide} from '../packages/core/src/hooks/mediaSide.ts';

const SURFACES = {
  info: '--color-background-inverted',
  error: '--color-background-error-inverted',
};

describe('toast text contrast', () => {
  for (const [name, theme] of Object.entries(FIRST_PARTY_THEMES)) {
    const tokens = {...tokenDefaults, ...themeTokens(withEmittedTokens(theme))};
    MODES.forEach((mode, modeIndex) => {
      for (const [type, surface] of Object.entries(SURFACES)) {
        it(`${name} ${mode} ${type} toast text reaches ${AA_NORMAL}:1`, () => {
          const color = token =>
            parseColor(resolveColor(`var(${token})`, tokens, modeIndex) ?? '');
          const background = color(surface);
          const ambient = color('--color-text-primary');
          const onDark = color('--color-on-dark');
          const onLight = color('--color-on-light');
          expect(background, surface).not.toBeNull();
          const side = pickInvertedSide(background, ambient, onDark, onLight);
          const text =
            side === 'off' ? ambient : side === 'dark' ? onDark : onLight;
          expect(
            contrastRatio(text, background),
            `${side} text on ${surface}`,
          ).toBeGreaterThanOrEqual(AA_NORMAL);
        });
      }
    });
  }
});
