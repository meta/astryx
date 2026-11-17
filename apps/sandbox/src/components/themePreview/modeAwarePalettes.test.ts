// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {findClosestRampStep} from './colorMath';
import {resolveOverrideHex} from './themeOverrides';

const modeAwareSeed = {
  name: 'Mode-aware',
  sourceHex: '#888888',
  tones: {50: '#777777'},
  dark: {
    sourceHex: '#999999',
    tones: {50: '#aaaaaa'},
  },
} as const;

describe('mode-aware canonical palette ramps', () => {
  it('matches each mode against its own canonical ramp', () => {
    expect(
      findClosestRampStep('#777777', [modeAwareSeed], 'light'),
    ).toMatchObject({tone: 50, hex: '#777777', verdict: 'exact'});
    expect(
      findClosestRampStep('#aaaaaa', [modeAwareSeed], 'dark'),
    ).toMatchObject({tone: 50, hex: '#aaaaaa', verdict: 'exact'});
  });

  it('resolves override suggestions from the requested mode', () => {
    expect(resolveOverrideHex(modeAwareSeed, 50, 'light')).toBe('#777777');
    expect(resolveOverrideHex(modeAwareSeed, 50, 'dark')).toBe('#aaaaaa');
  });
});
