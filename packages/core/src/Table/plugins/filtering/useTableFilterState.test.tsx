// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useTableFilterState.test.tsx
 * @input Uses vitest, @testing-library/react
 * @output Unit tests for the useTableFilterState hook
 * @position Testing; validates the filter state helper (set/overwrite,
 *   null-deletes, clearAll, callback stability)
 */

import {describe, it, expect} from 'vitest';
import {act, renderHook} from '@testing-library/react';
import {useTableFilterState} from './useTableFilterState';

// =============================================================================
// Initial state
// =============================================================================

describe('useTableFilterState — initial state', () => {
  it('starts with an empty filter map', () => {
    const {result} = renderHook(() => useTableFilterState());

    expect(result.current.filters).toEqual({});
  });

  it('adopts the provided initial state', () => {
    const {result} = renderHook(() =>
      useTableFilterState({status: 'active', tags: ['a', 'b']}),
    );

    expect(result.current.filters).toEqual({
      status: 'active',
      tags: ['a', 'b'],
    });
  });
});

// =============================================================================
// onFilterChange
// =============================================================================

describe('useTableFilterState — onFilterChange', () => {
  it('sets a filter value for a key', () => {
    const {result} = renderHook(() => useTableFilterState());

    act(() => {
      result.current.onFilterChange('status', 'active');
    });

    expect(result.current.filters).toEqual({status: 'active'});
  });

  it('overwrites an existing key with the new value', () => {
    const {result} = renderHook(() => useTableFilterState({status: 'active'}));

    act(() => {
      result.current.onFilterChange('status', 'archived');
    });

    expect(result.current.filters).toEqual({status: 'archived'});
  });

  it('keeps other keys intact when setting a new one', () => {
    const {result} = renderHook(() => useTableFilterState({status: 'active'}));

    act(() => {
      result.current.onFilterChange('owner', 'alice');
    });

    expect(result.current.filters).toEqual({
      status: 'active',
      owner: 'alice',
    });
  });

  it('deletes the key entirely when the value is null', () => {
    const {result} = renderHook(() =>
      useTableFilterState({status: 'active', owner: 'alice'}),
    );

    act(() => {
      result.current.onFilterChange('status', null);
    });

    // The key must be absent — not present with a null value.
    expect('status' in result.current.filters).toBe(false);
    expect(result.current.filters).toEqual({owner: 'alice'});
  });

  it('deleting a key that is not set leaves the state unchanged', () => {
    const {result} = renderHook(() => useTableFilterState({owner: 'alice'}));

    act(() => {
      result.current.onFilterChange('ghost', null);
    });

    expect(result.current.filters).toEqual({owner: 'alice'});
  });
});

// =============================================================================
// clearAll
// =============================================================================

describe('useTableFilterState — clearAll', () => {
  it('resets both initial and added filters to an empty map', () => {
    const {result} = renderHook(() => useTableFilterState({status: 'active'}));

    act(() => {
      result.current.onFilterChange('owner', 'alice');
    });
    expect(result.current.filters).toEqual({
      status: 'active',
      owner: 'alice',
    });

    act(() => {
      result.current.clearAll();
    });

    expect(result.current.filters).toEqual({});
  });
});

// =============================================================================
// Callback stability
// =============================================================================

describe('useTableFilterState — callback stability', () => {
  it('keeps onFilterChange and clearAll referentially stable across updates and rerenders', () => {
    const {result, rerender} = renderHook(() => useTableFilterState());
    const initialOnFilterChange = result.current.onFilterChange;
    const initialClearAll = result.current.clearAll;

    act(() => {
      result.current.onFilterChange('status', 'active');
    });
    rerender();

    expect(result.current.onFilterChange).toBe(initialOnFilterChange);
    expect(result.current.clearAll).toBe(initialClearAll);
  });
});
