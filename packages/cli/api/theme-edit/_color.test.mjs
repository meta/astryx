// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Color parsing and checks for the theme editor: every fixed CSS color
 * form parses to the same RGB, a value with no fixed color parses to null,
 * and only real CSS colors pass the color check.
 */

import {describe, expect, it} from 'vitest';
import {
  alphaOf,
  colorProblem,
  compositeOver,
  hex,
  isClipped,
  isColorValue,
  mixSide,
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

  it('reads hues, saturation and chroma out of range as CSS does', () => {
    for (const [v, want] of [
      ['hsl(-360 100% 50%)', '#ff0000'],
      ['hsl(-90 80% 50%)', '#8019e6'],
      ['hsl(-0.25turn 80% 50%)', '#8019e6'],
      [
        'hwb(-90 10% 10%)',
        hex(/** @type {number[]} */ (parseColor('hwb(270 10% 10%)'))),
      ],
      ['hsl(0 -50% 50%)', '#808080'],
      ['hsl(0 100% 150%)', '#ffffff'],
      [
        'oklch(0.6 -0.2 30)',
        hex(/** @type {number[]} */ (parseColor('oklch(0.6 0 30)'))),
      ],
      [
        'lch(50 -40 30)',
        hex(/** @type {number[]} */ (parseColor('lch(50 0 30)'))),
      ],
      ['lab(150 0 0)', '#ffffff'],
      ['rgb(+255,0,0)', '#ff0000'],
      ['color(srgb 1 0 0)', '#ff0000'],
      ['color(display-p3 1 0 0)', '#ff0000'],
      ['color(display-p3 0.5 0.5 0.5)', '#808080'],
    ])
      expect(hex(/** @type {number[]} */ (parseColor(v))), v).toBe(want);
  });

  it('refuses malformed functions, and says why a value cannot seed a color', () => {
    for (const v of [
      'rgb(1,2,3,4,5)',
      'rgb(255 0 0 /)',
      'rgb(255,0 0)',
      'rgb(10%,20%)',
      'hwb(0, 0%, 0%)',
    ]) {
      expect(parseColor(v), v).toBeNull();
      expect(isColorValue(v), v).toBe(false);
      expect(colorProblem(v)?.kind, v).toBe('malformed');
    }
    expect(colorProblem('Canvas')?.kind).toBe('system');
    expect(isColorValue('ButtonText')).toBe(true);
    // Every color() space CSS has is read; an unknown one is not.
    expect(colorProblem('color(rec2020 1 0 0)')).toBeNull();
    expect(colorProblem('color(banana 1 0 0)')).not.toBeNull();
    expect(colorProblem('transparent')?.kind).toBe('unfixed');
    expect(colorProblem('var(--x)')?.kind).toBe('unfixed');
    expect(colorProblem('banana')?.kind).toBe('unknown');
    expect(colorProblem('#0000')).toMatchObject({
      kind: 'translucent',
      opaque: '#000000',
    });
    expect(colorProblem('rgb(255 0 0 / 0)')).toMatchObject({
      kind: 'translucent',
      opaque: '#ff0000',
    });
    expect(colorProblem(' #7c3aed ')).toBeNull();
    expect(colorProblem('rgb(255 0 0 / 0.999)')?.message).toContain(
      'see-through (opacity 0.999)',
    );
    expect(colorProblem('rgb(255 0 0 / 0.9999)')?.message).toContain(
      'not fully opaque',
    );
    expect(isClipped('color(display-p3 1 0 0)')).toBe(true);
    expect(isClipped('#ff0000')).toBe(false);
    // Functions that compute at run time are taken as written.
    expect(isColorValue('rgb(var(--r) 0 0 / 0.5)')).toBe(true);
  });

  it('works out a color-mix() of two fixed colors', () => {
    expect(parseColor('color-mix(in srgb, red, blue)')).toEqual([
      127.5, 0, 127.5,
    ]);
  });

  it('returns null for a value with no fixed color', () => {
    for (const v of [
      'var(--color-accent)',
      // A mix with no fixed color, or in a space the reader does not mix in.
      'color-mix(in srgb, var(--x), blue)',
      'color-mix(in hsl, red, blue)',
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

describe('color-mix() sides', () => {
  it('reads no color from a share outside 0-100%, which CSS refuses', () => {
    expect(parseColor('color-mix(in srgb, red 150%, blue)')).toBeNull();
    expect(parseColor('color-mix(in srgb, red -10%, blue)')).toBeNull();
    expect(parseColor('color-mix(in srgb, red 100%, blue)')).not.toBeNull();
  });
  it('takes a share after or before a color that holds percentages itself', () => {
    expect(
      hex(
        /** @type {any} */ (
          parseColor('color-mix(in srgb, hsl(0 100% 50%) 30%, blue)')
        ),
      ),
    ).toBe('#4d00b3');
    expect(
      hex(
        /** @type {any} */ (
          parseColor('color-mix(in srgb, 30% hsl(0 100% 50%), blue)')
        ),
      ),
    ).toBe('#4d00b3');
    expect(
      parseColor('color-mix(in oklch, oklch(70% 0.1 200) 25%, white)'),
    ).not.toBeNull();
    expect(mixSide('rgb(255 0 0 / 50%)')).toEqual({
      color: 'rgb(255 0 0 / 50%)',
      pct: null,
    });
  });
});
