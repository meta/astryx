// Copyright (c) Meta Platforms, Inc. and affiliates.
import {describe, expect, it} from 'vitest';
import {boundedChartRadius} from '../components/docs/chartRadius';

describe('bounded chart radius', () => {
  it.each([
    [10.8, 80, 160, 10],
    [10, 5.1, 40, 2],
    [10, 40, 5.12, 2],
    [10, 40, 1.9, 0],
    [10, 8, 8, 4],
    [0, 80, 160, 0],
    [2.8, 80, 160, 2],
    [10, -5.1, -40, 2],
  ])(
    'bounds and floors %s for a %s × %s mark',
    (radius, width, height, expected) => {
      expect(boundedChartRadius(radius, width, height)).toBe(expected);
    },
  );
  it.each([NaN, Infinity, -Infinity])(
    'handles a non-finite radius or dimension (%s)',
    invalid => {
      expect(boundedChartRadius(invalid, 40, 80)).toBe(0);
      expect(boundedChartRadius(10, invalid, 80)).toBe(0);
      expect(boundedChartRadius(10, 40, invalid)).toBe(0);
    },
  );
});
