// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {layeredContrast, resolveColor} from './theme-contrast.mjs';

describe('theme-contrast helpers', () => {
  it('resolves pairs, light-dark() and var() for each scheme', () => {
    const tokens = {
      '--a': ['#111111', '#eeeeee'],
      '--b': 'light-dark(var(--a), #222222)',
      '--c': 'rgba(255, 255, 255, 0.1)',
    };
    expect(resolveColor('var(--a)', tokens, 1)).toBe('#eeeeee');
    expect(resolveColor('var(--b)', tokens, 0)).toBe('#111111');
    expect(resolveColor('var(--b)', tokens, 1)).toBe('#222222');
    expect(resolveColor('var(--c)', tokens, 0)).toBe(
      'rgba(255, 255, 255, 0.1)',
    );
    expect(resolveColor('var(--missing)', tokens, 0)).toBeNull();
  });

  it('composites translucent layers from the top down', () => {
    // White at 10% over #262626 flattens to #3c3c3c; #9e9e9e on it is 4.11:1.
    const ratio = layeredContrast('#9e9e9e', ['#ffffff1a', '#262626'], 1);
    expect(ratio).toBeCloseTo(4.11, 1);
    expect(layeredContrast('#000000', ['#ffffff'], 0)).toBeCloseTo(21, 5);
  });
});
