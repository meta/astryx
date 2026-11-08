// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {palette as stoneModePalettes} from './stonePalettes.generated';
import {stonePalettes} from './stoneTheme';

const stops = [
  0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95,
  100,
] as const;

const chromaticFamilies = [
  'blue',
  'cyan',
  'green',
  'teal',
  'yellow',
  'orange',
  'red',
  'pink',
  'purple',
] as const;

const exactMidpoints = {
  red: '#8a716d',
  orange: '#8f7154',
  yellow: '#927f25',
  green: '#528b49',
  teal: '#588174',
  cyan: '#507b86',
  blue: '#6c7888',
  purple: '#7b7486',
  pink: '#83727c',
} as const;

describe('stone palette artifact', () => {
  it('keeps every reviewed family and mode structurally complete', () => {
    expect(Object.keys(stonePalettes)).toEqual([
      'neutral',
      ...chromaticFamilies,
    ]);

    for (const familyName of ['neutral', ...chromaticFamilies] as const) {
      const family = stonePalettes[familyName];
      expect(family.hue).toBeTypeOf('number');
      expect(family.chroma).toBeTypeOf('number');
      for (const stop of stops) {
        expect(family[stop]).toMatch(/^#[0-9a-f]{6}$/i);
        expect(stoneModePalettes[familyName].light[stop]).toMatch(
          /^#[0-9a-f]{6}$/i,
        );
        expect(stoneModePalettes[familyName].dark[stop]).toMatch(
          /^#[0-9a-f]{6}$/i,
        );
      }
      expect(family[0]).toBe('#000000');
      expect(family[100]).toBe('#ffffff');
    }
  });

  it('preserves Stone exact anchors in both modes', () => {
    expect(stoneModePalettes.neutral.light[15]).toBe('#25252a');
    expect(stoneModePalettes.neutral.light[50]).toBe('#77777c');
    expect(stoneModePalettes.neutral.light[90]).toBe('#e2e2e8');
    expect(stoneModePalettes.neutral.dark[15]).toBe('#25252a');
    expect(stoneModePalettes.neutral.dark[50]).toBe('#77777c');
    expect(stoneModePalettes.neutral.dark[90]).toBe('#e2e2e8');

    for (const familyName of chromaticFamilies) {
      expect(stoneModePalettes[familyName].light[50]).toBe(
        exactMidpoints[familyName],
      );
      expect(stoneModePalettes[familyName].dark[50]).toBe(
        exactMidpoints[familyName],
      );
      expect(stonePalettes[familyName]).not.toHaveProperty('light');
      expect(stonePalettes[familyName]).not.toHaveProperty('dark');
    }

    expect(stoneModePalettes.yellow.light[90]).toBe('#f4e1b7');
    expect(stoneModePalettes.yellow.dark[90]).toBe('#f1e1b9');
    expect(stoneModePalettes.orange.light[90]).toBe('#ffdcbb');
    expect(stoneModePalettes.orange.dark[90]).toBe('#ffdcbb');
    expect(stoneModePalettes.green.light[85]).toBe('#bfdfbb');
    expect(stoneModePalettes.green.dark[85]).toBe('#c3ddbf');
  });
});
