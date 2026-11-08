// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {neutralPalettes} from './neutralPalettes';

const neutralPaletteStops = [
  0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95,
  100,
] as const;

describe('neutral palette artifact', () => {
  it('keeps the approved palette structurally valid', () => {
    expect(neutralPalettes.black).toBe('#000000');
    expect(neutralPalettes.white).toBe('#ffffff');
    expect(Object.keys(neutralPalettes)).toEqual([
      'black',
      'white',
      'neutral',
      'red',
      'orange',
      'yellow',
      'green',
      'teal',
      'cyan',
      'blue',
      'purple',
      'pink',
    ]);

    for (const familyName of [
      'neutral',
      'red',
      'orange',
      'yellow',
      'green',
      'teal',
      'cyan',
      'blue',
      'purple',
      'pink',
    ] as const) {
      const family = neutralPalettes[familyName];
      for (const stop of neutralPaletteStops) {
        expect(family.light[stop]).toMatch(/^#[0-9a-f]{6}$/i);
        expect(family.dark[stop]).toMatch(/^#[0-9a-f]{6}$/i);
      }
      expect(family.light[0]).toBe('#000000');
      expect(family.dark[0]).toBe('#000000');
      expect(family.light[100]).toBe('#ffffff');
      expect(family.dark[100]).toBe('#ffffff');
    }
  });

  it('keeps the approved muted dark edge values', () => {
    expect(
      Object.fromEntries(
        (
          [
            'red',
            'orange',
            'yellow',
            'green',
            'teal',
            'cyan',
            'blue',
            'purple',
            'pink',
          ] as const
        ).map(family => [family, neutralPalettes[family].dark[25]]),
      ),
    ).toEqual({
      red: '#5b2b28',
      orange: '#503424',
      yellow: '#453a1c',
      green: '#2b422b',
      teal: '#28413c',
      cyan: '#274046',
      blue: '#253c5a',
      purple: '#4a2f51',
      pink: '#572b3d',
    });
  });
});
