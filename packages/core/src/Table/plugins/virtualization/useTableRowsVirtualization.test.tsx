// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useTableRowsVirtualization.test.tsx
 * @input Public capability hook
 * @output Capability identity and immutability tests
 * @position Colocated Table virtualization capability coverage
 */
import {describe, it, expect} from 'vitest';
import {renderHook} from '@testing-library/react';
import {
  getTableVirtualizationConfig,
  useTableRowsVirtualization,
} from './useTableRowsVirtualization';

describe('Table virtualization capability', () => {
  it('is immutable geometry intent with stable identity and no public payload or knobs', () => {
    const {result, rerender} = renderHook(
      ({rowHeight, viewportHeight}) =>
        useTableRowsVirtualization({rowHeight, viewportHeight}),
      {initialProps: {rowHeight: 48, viewportHeight: 240}},
    );
    const original = result.current;
    expect(Object.keys(original)).toEqual([]);
    expect(Object.isFrozen(original)).toBe(true);
    expect(Object.isFrozen(getTableVirtualizationConfig(original))).toBe(true);
    expect(getTableVirtualizationConfig(original)).toEqual({
      rowHeight: 48,
      viewportHeight: 240,
    });
    expect(
      getTableVirtualizationConfig({rowHeight: 48, viewportHeight: 240}),
    ).toBeUndefined();
    rerender({rowHeight: 48, viewportHeight: 240});
    expect(result.current).toBe(original);
    rerender({rowHeight: 50, viewportHeight: 240});
    expect(result.current).not.toBe(original);
  });
});
