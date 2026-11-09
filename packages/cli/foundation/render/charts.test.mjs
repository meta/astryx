// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the size a render gives a recharts ResponsiveContainer.
 */

import {describe, expect, it} from 'vitest';
import {chartSize} from './charts.mjs';

describe('chartSize', () => {
  it("keeps the container's own numbers", () => {
    expect(chartSize({width: 320, height: 180})).toEqual({width: 320, height: 180});
  });

  it('makes a sparkline six times as wide as it is high, and a taller chart two and a half times', () => {
    expect(chartSize({width: '100%', height: 24})).toEqual({width: 144, height: 24});
    expect(chartSize({width: '100%', height: 200})).toEqual({width: 500, height: 200});
    expect(chartSize({width: '100%', height: 600})).toEqual({width: 800, height: 600});
  });

  it('follows an aspect ratio, and starts a chart with no numbers at 300 pixels high', () => {
    expect(chartSize({width: '100%', aspect: 2})).toEqual({width: 800, height: 400});
    expect(chartSize({width: 400, aspect: 2})).toEqual({width: 400, height: 200});
    expect(chartSize({})).toEqual({width: 750, height: 300});
  });
});
