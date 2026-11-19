// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {matchaPalettes} from './matchaPalettes';

const stops = [
  0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95,
  100,
] as const;
const families = [
  'neutral',
  'blue',
  'cyan',
  'green',
  'orange',
  'pink',
  'purple',
  'red',
  'teal',
  'yellow',
] as const;

describe('matcha palette artifact', () => {
  it('exposes complete reviewed light and dark ramps', () => {
    expect(new Set(Object.keys(matchaPalettes))).toEqual(
      new Set(['black', 'white', ...families]),
    );
    for (const familyName of families) {
      const family = matchaPalettes[familyName];
      for (const mode of ['light', 'dark'] as const) {
        for (const stop of stops) {
          expect(family[mode][stop]).toMatch(/^#[0-9a-f]{6}$/i);
        }
        expect(family[mode][0]).toBe('#000000');
        expect(family[mode][100]).toBe('#ffffff');
      }
    }
  });

  it('keeps Matcha semantic, categorical, and Tea Gold values exact', () => {
    expect(matchaPalettes.neutral.light[20]).toBe('#3e481d');
    expect(matchaPalettes.neutral.light[40]).toBe('#707e46');
    expect(matchaPalettes.neutral.light[75]).toBe('#c0cba9');
    expect(matchaPalettes.neutral.light[95]).toBe('#f0f0e0');
    expect(matchaPalettes.neutral.dark[5]).toBe('#12140e');
    expect(matchaPalettes.neutral.dark[75]).toBe('#c0cba9');
    expect(matchaPalettes.yellow.light[80]).toBe('#f2c000');
    expect(matchaPalettes.yellow.dark[85]).toBe('#f6d066');
  });
});
