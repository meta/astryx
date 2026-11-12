// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTableSortableState.tsx
 * @input React, TableSortState types
 * @output Exports useTableSortableState hook and config types
 * @position Sort state helper; manages sort state + applies local sort to data.
 *   Pairs with useTableSortable (the headless sort plugin).
 *
 * Modeled after useTableSelectionState — a convenience layer that owns state
 * and produces a ready-to-use config for the headless plugin.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Table/plugins/sortable/index.ts (exports)
 * - /packages/core/src/Table/Table.doc.mjs (sort documentation)
 */

import {useState, useMemo, useCallback, useRef} from 'react';
import type {TableSortState, UseTableSortableConfig} from './useTableSortable';
import {useCollator} from '../../../i18n/useCollator';

// =============================================================================
// Comparator Types
// =============================================================================

/**
 * Custom comparator for a single sort key.
 * Receives two row values and returns a standard comparison number.
 * Direction (ascending/descending) is applied automatically by the hook —
 * comparators should always sort in ascending order.
 */
export type TableSortComparator<T> = (a: T, b: T) => number;

function toSortableString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return '';
}

// =============================================================================
// Hook Config
// =============================================================================

/**
 * Configuration for useTableSortableState.
 *
 * @template T - The row data type
 * @template TSortKey - Union of valid sort key strings
 *
 * @example
 * ```
 * const { sortedData, sortConfig } = useTableSortableState({
 *   data: users,
 *   defaultSort: [{ sortKey: 'name', direction: 'ascending' }],
 * });
 * const sortPlugin = useTableSortable(sortConfig);
 * <Table data={sortedData} plugins={{ sort: sortPlugin }} />
 * ```
 */
export interface UseTableSortableStateConfig<
  T extends Record<string, unknown>,
  TSortKey extends string = string,
> {
  /**
   * The data array to sort.
   * The hook returns a new sorted copy — the original is never mutated.
   */
  data: T[];

  /**
   * Initial sort state for uncontrolled mode.
   * Ignored when `sort` is provided.
   * @default []
   */
  defaultSort?: TableSortState<TSortKey>;

  /**
   * Controlled sort state. When provided, the hook uses this instead of
   * internal state. Must be paired with `onSortChange`.
   */
  sort?: TableSortState<TSortKey>;

  /**
   * Called when the sort state changes. Required when `sort` is provided.
   */
  onSortChange?: (sort: TableSortState<TSortKey>) => void;

  /**
   * Custom comparators per sort key.
   * Keys are sort key strings; values are comparator functions that receive
   * two row items. Comparators should sort ascending — the hook flips the
   * sign for descending.
   *
   * For keys not in this map, the hook falls back to an `Intl.Collator`
   * comparison (`{numeric: true}`) on the stringified values, bound to the
   * active `InternationalizationProvider` locale.
   *
   * @example
   * ```
   * const collator = useCollator({numeric: true});
   * comparators: {
   *   age: (a, b) => a.age - b.age,
   *   name: (a, b) => collator.compare(a.name, b.name),
   * }
   * ```
   */
  comparators?: Partial<Record<TSortKey, TableSortComparator<T>>>;

  /**
   * Allow returning to unsorted state.
   * Passed through to the sortable plugin config.
   * @default true
   */
  allowUnsortedState?: boolean;

  /**
   * Enable multi-sort via modifier key.
   * Passed through to the sortable plugin config.
   * @default false
   */
  isMultiSortEnabled?: boolean;
}

// =============================================================================
// Hook Result
// =============================================================================

export interface UseTableSortableStateResult<
  T extends Record<string, unknown>,
  TSortKey extends string = string,
> {
  /** Sorted copy of the input data. Memoized — stable when sort state and data don't change. */
  sortedData: T[];

  /** Current sort state. */
  sort: TableSortState<TSortKey>;

  /** Ready-to-use config for useTableSortable. */
  sortConfig: UseTableSortableConfig<TSortKey>;

  /**
   * Apply the current sort state to arbitrary data.
   * Useful when you have multiple data sources or need to sort a subset.
   */
  applySort: (data: T[]) => T[];
}

// =============================================================================
// Default Comparator
// =============================================================================

function defaultCompare<T extends Record<string, unknown>>(
  a: T,
  b: T,
  sortKey: string,
  collator: Intl.Collator,
): number {
  const aVal = a[sortKey];
  const bVal = b[sortKey];

  // null/undefined/NaN sort to the end. NaN must not reach the numeric fast
  // path: a NaN comparator result reads as "equal" to Array.sort, which makes
  // the comparator inconsistent and corrupts the order of the other rows.
  const aMissing =
    aVal == null || (typeof aVal === 'number' && Number.isNaN(aVal));
  const bMissing =
    bVal == null || (typeof bVal === 'number' && Number.isNaN(bVal));
  if (aMissing && bMissing) {
    return 0;
  }
  if (aMissing) {
    return 1;
  }
  if (bMissing) {
    return -1;
  }

  // number fast path
  if (typeof aVal === 'number' && typeof bVal === 'number') {
    return aVal - bVal;
  }

  // string comparison with numeric collation, bound to the provider locale
  // via useCollator() rather than a raw localeCompare(value, locale) call.
  return collator.compare(toSortableString(aVal), toSortableString(bVal));
}

// =============================================================================
// Sort Logic
// =============================================================================

function sortData<
  T extends Record<string, unknown>,
  TSortKey extends string = string,
>(
  data: T[],
  sortState: TableSortState<TSortKey>,
  comparators: Partial<Record<TSortKey, TableSortComparator<T>>> | undefined,
  collator: Intl.Collator,
): T[] {
  if (sortState.length === 0) {
    return data;
  }

  return [...data].sort((a, b) => {
    for (const entry of sortState) {
      const {sortKey, direction} = entry;
      const customCmp = comparators?.[sortKey];
      const cmp = customCmp
        ? customCmp(a, b)
        : defaultCompare(a, b, sortKey, collator);

      if (cmp !== 0) {
        return direction === 'ascending' ? cmp : -cmp;
      }
    }
    return 0;
  });
}

// =============================================================================
// Hook
// =============================================================================

// One options object, so the collator, and the sorted data with it, survive
// a render that changes neither the locale nor the sort.
const COLLATOR_OPTIONS: Intl.CollatorOptions = {numeric: true};

/**
 * useTableSortableState — manages sort state and applies local sort to data.
 *
 * Convenience layer over useTableSortable. Owns sort state internally
 * (or accepts controlled state), sorts the data, and produces a ready-to-use
 * config for the headless sortable plugin.
 *
 * @example
 * ```
 * const { sortedData, sortConfig } = useTableSortableState({
 *   data: employees,
 *   defaultSort: [{ sortKey: 'name', direction: 'ascending' }],
 *   comparators: { age: (a, b) => a.age - b.age },
 * });
 * const sortPlugin = useTableSortable(sortConfig);
 * <Table data={sortedData} columns={columns} plugins={{ sort: sortPlugin }} />
 * ```
 */
export function useTableSortableState<
  T extends Record<string, unknown>,
  TSortKey extends string = string,
>(
  config: UseTableSortableStateConfig<T, TSortKey>,
): UseTableSortableStateResult<T, TSortKey> {
  const {
    data,
    defaultSort = [],
    sort: controlledSort,
    onSortChange: controlledOnSortChange,
    comparators,
    allowUnsortedState,
    isMultiSortEnabled,
  } = config;
  const collator = useCollator(COLLATOR_OPTIONS);

  // Internal state (used in uncontrolled mode)
  const [internalSort, setInternalSort] =
    useState<TableSortState<TSortKey>>(defaultSort);

  // Resolve controlled vs uncontrolled
  const isControlled = controlledSort !== undefined;
  const sort = isControlled ? controlledSort : internalSort;
  const onSortChange = isControlled
    ? (controlledOnSortChange ?? (() => {}))
    : setInternalSort;

  // Stable ref for comparators to avoid re-sorting on inline object identity changes
  const comparatorsRef = useRef(comparators);
  comparatorsRef.current = comparators;

  // The config holds one stable handler, so an inline callback does not
  // recreate it. The handler reads the latest callback when the user sorts.
  const onSortChangeRef = useRef(onSortChange);
  onSortChangeRef.current = onSortChange;
  const handleSortChange = useCallback(
    (nextSort: TableSortState<TSortKey>) => onSortChangeRef.current(nextSort),
    [],
  );

  // Sorted data — memoized on sort state + data identity
  const sortedData = useMemo(
    () => sortData(data, sort, comparators, collator),
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- comparator identity is not reactive: callers often pass an inline object
    [data, sort, collator],
  );

  // applySort — lets consumers sort arbitrary data with the current state
  const applySort = useCallback(
    (inputData: T[]): T[] =>
      sortData(inputData, sort, comparatorsRef.current, collator),
    [sort, collator],
  );

  // Config ready for useTableSortable
  const sortConfig = useMemo(
    (): UseTableSortableConfig<TSortKey> => ({
      sort,
      onSortChange: handleSortChange,
      allowUnsortedState,
      isMultiSortEnabled,
    }),
    [sort, handleSortChange, allowUnsortedState, isMultiSortEnabled],
  );

  return {sortedData, sort, sortConfig, applySort};
}
