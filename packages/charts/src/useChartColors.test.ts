// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useChartColors.test.ts
 * @input Uses vitest, @testing-library/react renderHook, useChartColors
 * @output Functional tests for the theme-aware chart color palette hook
 * @position Colocated test for useChartColors.ts (issue #4295 viz coverage)
 */

import {describe, it, expect} from 'vitest';
import {renderHook} from '@testing-library/react';
import {useChartColors} from './useChartColors';

describe('useChartColors', () => {
  it('returns the requested number of categorical colors', () => {
    const {result} = renderHook(() => useChartColors());
    const colors = result.current.categorical(4);
    expect(colors).toHaveLength(4);
    for (const c of colors) {
      expect(typeof c).toBe('string');
      expect(c.length).toBeGreaterThan(0);
    }
  });

  it('assigns distinct colors within the first palette cycle', () => {
    const {result} = renderHook(() => useChartColors());
    const colors = result.current.categorical(4);
    expect(new Set(colors).size).toBe(4);
  });

  it('wraps around the palette when more series than slots are requested', () => {
    const {result} = renderHook(() => useChartColors());
    const colors = result.current.categorical(12);
    expect(colors).toHaveLength(12);
    // 10 categorical tokens — slot 10 and 11 reuse slot 0 and 1.
    expect(colors[10]).toBe(colors[0]);
    expect(colors[11]).toBe(colors[1]);
  });

  it('returns an empty palette for a non-positive count', () => {
    const {result} = renderHook(() => useChartColors());
    expect(result.current.categorical(0)).toEqual([]);
  });

  it('returns a referentially stable API across rerenders', () => {
    const {result, rerender} = renderHook(() => useChartColors());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
