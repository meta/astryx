// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Color parsing and checks for the theme editor: every fixed CSS color
 * form parses to the same RGB, a value with no fixed color parses to null,
 * and only real CSS colors pass the color check.
 */

import {describe, expect, it} from 'vitest';
import {
  alphaOf,
  compositeOver,
  hex,
  isColorValue,
  parseColor,
  ratio,
} from './_color.mjs';

describe('parseColor', () => {
  it('reads every fixed CSS color form', () => {
    for (const v of [
      '#f00',
      '#ff0000',
      '#ff000080',
      'red',
      'RED',
      'rgb(255 0 0)',
      'rgba(255, 0, 0, 0.5)',
      'rgb(100% 0% 0% / 50%)',
      'hsl(0 100% 50%)',
      'hsla(0turn, 100%, 50%, 1)',
      'hwb(0 0% 0%)',
      'lab(54.29 80.82 69.88)',
      'lch(54.29 106.84 40.85)',
      'oklab(0.628 0.2249 0.1258)',
      'oklch(62.8% 0.2577 29.23)',
    ]) {
      const rgb = parseColor(v);
      expect(rgb, v).not.toBeNull();
      expect(hex(/** @type {number[]} */ (rgb)), v).toBe('#ff0000');
    }
  });

  it('returns null for a value with no fixed color', () => {
    for (const v of [
      'var(--color-accent)',
      'color-mix(in srgb, red, blue)',
      'light-dark(red, blue)',
      'transparent',
      'banana',
    ])
      expect(parseColor(v), v).toBeNull();
  });
});

describe('isColorValue', () => {
  it('takes real CSS colors, keywords and color functions only', () => {
    for (const v of [
      'rebeccapurple',
      'currentcolor',
      'var(--x)',
      'oklch(0.5 0.1 250)',
      '#abcd',
    ])
      expect(isColorValue(v), v).toBe(true);
    for (const v of ['banana', 'notacolor', 'redd', '#ggg', '12px'])
      expect(isColorValue(v), v).toBe(false);
  });
});

describe('contrast math', () => {
  it('gives black on white 21:1', () => {
    expect(ratio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
  });
});

describe('see-through colors', () => {
  it('reads the opacity of every form', () => {
    expect(alphaOf('#11111122')).toBeCloseTo(0x22 / 255, 5);
    expect(alphaOf('#0008')).toBeCloseTo(0x88 / 255, 5);
    expect(alphaOf('rgba(0,0,0,0.15)')).toBe(0.15);
    expect(alphaOf('rgb(0 0 0 / 15%)')).toBe(0.15);
    expect(alphaOf('transparent')).toBe(0);
    expect(alphaOf('#111111')).toBe(1);
  });

  it('measures translucent text over what is under it', () => {
    const seen = compositeOver([0, 0, 0], 0.15, [255, 255, 255]);
    expect(ratio(seen, [255, 255, 255])).toBeLessThan(1.5);
  });
});
