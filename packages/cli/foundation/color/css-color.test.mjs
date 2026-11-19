// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The color reader's own copies of the palette's color formulas give
 *   exactly what the generated palette engine gives.
 * @input A grid of sRGB colors and OKLab points
 * @output Pass when both copies agree
 * @position foundation/color — beside css-color.mjs
 */

import {describe, expect, it} from 'vitest';
import {hex, oklabToLinearRgb, relativeLuminance} from './css-color.mjs';
import * as palette from '../../api/theme/palette/generate/color.mjs';

const STEPS = [0, 1, 9, 10, 11, 37, 64, 99, 127, 128, 191, 200, 254, 255];

describe('the color reader and the palette engine', () => {
  it('give the same relative luminance for every color on the grid', () => {
    for (const r of STEPS)
      for (const g of STEPS)
        for (const b of STEPS)
          expect(relativeLuminance([r, g, b])).toBe(palette.luminance(hex([r, g, b])));
  });

  it('give the same linear RGB for every OKLab point on the grid', () => {
    for (const l of [0, 0.1, 0.35, 0.5, 0.75, 0.95, 1])
      for (const a of [-0.3, -0.1, 0, 0.05, 0.2])
        for (const b of [-0.3, -0.05, 0, 0.1, 0.25])
          expect(oklabToLinearRgb(l, a, b)).toEqual(palette.oklabToLinearRgb(l, a, b));
  });
});
