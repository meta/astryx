// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {expandRadiusScale} from './expandRadiusScale';

describe('expandRadiusScale', () => {
  it('generates default scale', () => {
    const tokens = expandRadiusScale({base: 4, multiplier: 1});
    expect(tokens['--radius-none']).toBe('0px');
    expect(tokens['--radius-inner']).toBe('4px');
    expect(tokens['--radius-element']).toBe('8px');
    expect(tokens['--radius-container']).toBe('12px');
    expect(tokens['--radius-page']).toBe('28px');
    expect(tokens['--radius-chat']).toBe('28px');
    expect(tokens['--radius-full']).toBe('9999px');
  });

  it('applies multiplier', () => {
    const tokens = expandRadiusScale({base: 4, multiplier: 1.5});
    expect(tokens['--radius-inner']).toBe('6px');
    expect(tokens['--radius-element']).toBe('12px');
    expect(tokens['--radius-container']).toBe('18px');
    expect(tokens['--radius-page']).toBe('42px');
    expect(tokens['--radius-chat']).toBe('42px');
  });

  it('multiplier 0 produces all zeros', () => {
    const tokens = expandRadiusScale({base: 4, multiplier: 0});
    expect(tokens['--radius-none']).toBe('0px');
    expect(tokens['--radius-inner']).toBe('0px');
    expect(tokens['--radius-element']).toBe('0px');
    expect(tokens['--radius-container']).toBe('0px');
    expect(tokens['--radius-page']).toBe('0px');
    expect(tokens['--radius-chat']).toBe('0px');
    expect(tokens['--radius-full']).toBe('9999px');
  });

  it('fixed tokens are unaffected by multiplier', () => {
    const tokens = expandRadiusScale({base: 4, multiplier: 2});
    expect(tokens['--radius-none']).toBe('0px');
    expect(tokens['--radius-full']).toBe('9999px');
  });

  it('rounds fractional results to nearest integer', () => {
    const tokens = expandRadiusScale({base: 3, multiplier: 1.3});
    // 3 * 1 * 1.3 = 3.9 → 4px
    expect(tokens['--radius-inner']).toBe('4px');
    // 3 * 2 * 1.3 = 7.8 → 8px
    expect(tokens['--radius-element']).toBe('8px');
  });

  it('works with non-standard base', () => {
    const tokens = expandRadiusScale({base: 6, multiplier: 1});
    expect(tokens['--radius-inner']).toBe('6px');
    expect(tokens['--radius-element']).toBe('12px');
    expect(tokens['--radius-container']).toBe('18px');
    expect(tokens['--radius-page']).toBe('42px');
  });
});
