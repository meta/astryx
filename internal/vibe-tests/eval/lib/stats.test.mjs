// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {differenceInterval, summarize, wilsonInterval} from './stats.mjs';

describe('wilsonInterval', () => {
  it('returns nulls for zero trials', () => {
    expect(wilsonInterval(0, 0)).toEqual({rate: null, low: null, high: null});
  });

  it('matches the textbook interval for 5 of 10', () => {
    const {rate, low, high} = wilsonInterval(5, 10);
    expect(rate).toBe(0.5);
    expect(low).toBeCloseTo(0.2366, 3);
    expect(high).toBeCloseTo(0.7634, 3);
  });

  it('stays inside 0..1 at the edges', () => {
    expect(wilsonInterval(0, 12).low).toBe(0);
    expect(wilsonInterval(12, 12).high).toBe(1);
    expect(wilsonInterval(12, 12).low).toBeGreaterThan(0.7);
  });

  it('rejects impossible counts', () => {
    expect(() => wilsonInterval(3, 2)).toThrow(RangeError);
    expect(() => wilsonInterval(1.5, 2)).toThrow(TypeError);
  });
});

describe('differenceInterval', () => {
  it('is centered on the difference and contains zero for small equal samples', () => {
    const result = differenceInterval(6, 12, 6, 12);
    expect(result.difference).toBe(0);
    expect(result.low).toBeLessThan(0);
    expect(result.high).toBeGreaterThan(0);
  });

  it('excludes zero for a large clear gap', () => {
    const result = differenceInterval(95, 100, 40, 100);
    expect(result.difference).toBeCloseTo(0.55);
    expect(result.low).toBeGreaterThan(0);
  });
});

describe('summarize', () => {
  it('ignores missing values', () => {
    expect(summarize([1, NaN, 3, undefined])).toEqual({mean: 2, min: 1, max: 3});
    expect(summarize([])).toEqual({mean: null, min: null, max: null});
  });
});
