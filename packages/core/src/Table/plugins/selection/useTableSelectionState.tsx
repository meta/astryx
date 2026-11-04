// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTableSelectionState.tsx
 * @input React, UseTableSelectionConfig type
 * @output Exports useTableSelectionState hook and public selection state types
 * @position Selection state helper; manages selection set with correct
 *   disabled/selectable filtering. Pairs with useTableSelection.
 *
 * Modeled after the internal useTableRowSelectionState which handles
 * select-all correctly by preserving disabled-but-selected items and
 * only toggling actionable (selectable + enabled) items.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Table/plugins/selection/index.ts (exports)
 * - /packages/core/src/Table/Table.doc.mjs (selection documentation)
 */

import {useCallback, useMemo, useRef} from 'react';
import type {UseTableSelectionConfig} from './useTableSelection';

// =============================================================================
// Config Type
// =============================================================================

export interface UseTableSelectionStateConfig<
  T extends Record<string, unknown>,
> {
  /**
   * The data array currently rendered in the table.
   * Pass the **filtered/visible** data, not the full dataset — select-all
   * operates on this array, so passing unfiltered data would select hidden rows.
   */
  data: T[];
  /**
   * Key extractor — returns a unique string ID for each item.
   * Can be a property name or a function.
   */
  idKey: (keyof T & string) | ((item: T) => string);
  /**
   * Should this row show a checkbox? Non-selectable rows are excluded
   * from select-all and don\u2019t render a checkbox.
   * @default () => true
   */
  getIsItemSelectable?: (item: T) => boolean;
  /**
   * Is this row\u2019s checkbox interactive? Disabled rows are frozen \u2014
   * select-all won\u2019t add or remove them from the selection.
   * A disabled row that was selected before becoming disabled stays selected.
   * @default () => true
   */
  getIsItemEnabled?: (item: T) => boolean;
  /**
   * Controlled selected keys. The hook manages the selection set and
   * calls this setter when it changes.
   */
  selectedKeys: Set<string>;
  /**
   * Setter for the controlled selected keys.
   */
  setSelectedKeys: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export interface TableSelectionState {
  /** Complete controlled selection, including keys outside the current view. */
  readonly selectedKeys: ReadonlySet<string>;
  /** Number of keys in the complete controlled selection. */
  readonly selectedCount: number;
  /** Whether the complete controlled selection contains any keys. */
  readonly hasSelection: boolean;
  /** Clear every selected key, including keys outside the current view. */
  clearSelection: () => void;
}

export interface UseTableSelectionStateResult<
  T extends Record<string, unknown>,
> {
  /** Ready-to-use config for useTableSelection. */
  selectionConfig: UseTableSelectionConfig<T>;
  /** Shared state for selection-aware UI outside the behavior plugin. */
  selectionState: TableSelectionState;
}

// =============================================================================
// Hook
// =============================================================================

const stableTrue = () => true;

export function useTableSelectionState<T extends Record<string, unknown>>(
  config: UseTableSelectionStateConfig<T>,
): UseTableSelectionStateResult<T> {
  const {
    data,
    idKey,
    getIsItemSelectable = stableTrue,
    getIsItemEnabled = stableTrue,
    selectedKeys,
    setSelectedKeys,
  } = config;

  const getId = useCallback(
    (item: T): string =>
      typeof idKey === 'function' ? idKey(item) : String(item[idKey]),
    [idKey],
  );

  // Items that are both selectable and enabled — the "actionable" set
  const getIsItemSelectableAndEnabled = useCallback(
    (item: T) => getIsItemSelectable(item) && getIsItemEnabled(item),
    [getIsItemSelectable, getIsItemEnabled],
  );

  // IDs of all actionable items
  const selectableIDs = useMemo(
    () => new Set(data.filter(getIsItemSelectableAndEnabled).map(getId)),
    [data, getIsItemSelectableAndEnabled, getId],
  );

  // Selected IDs that are NOT actionable (disabled-but-selected).
  // These are preserved across select-all / deselect-all.
  const frozenSelectedIDs = useMemo(() => {
    const frozen = new Set<string>();
    for (const id of selectedKeys) {
      if (!selectableIDs.has(id)) {
        frozen.add(id);
      }
    }
    return frozen;
  }, [selectedKeys, selectableIDs]);

  // All IDs that *would* be selected if select-all is checked
  // (all actionable items + any frozen selected items)
  const allSelectableIDs = useMemo(
    () => new Set([...selectedKeys, ...selectableIDs]),
    [selectedKeys, selectableIDs],
  );

  const getAllSelected = useCallback(() => {
    // Require at least one actionable row: with zero visible selectable
    // rows (e.g. a filter with no matches while a selection exists), the
    // union-based size comparison would read any non-empty selection as
    // "all selected" — a checked header checkbox over an empty table that
    // deselect-all can't clear, since the invisible keys count as frozen.
    if (selectableIDs.size === 0) {
      return false;
    }
    return allSelectableIDs.size === selectedKeys.size;
  }, [allSelectableIDs, selectableIDs, selectedKeys]);

  // Use refs to keep onSelectAll stable
  const frozenSelectedIDsRef = useRef(frozenSelectedIDs);
  frozenSelectedIDsRef.current = frozenSelectedIDs;

  const allSelectableIDsRef = useRef(allSelectableIDs);
  allSelectableIDsRef.current = allSelectableIDs;

  const onSelectAll = useCallback(
    ({isAllSelected}: {isAllSelected: boolean}) => {
      setSelectedKeys(
        isAllSelected
          ? // Select all actionable + preserve frozen
            allSelectableIDsRef.current
          : // Deselect all actionable, keep frozen
            frozenSelectedIDsRef.current,
      );
    },
    [setSelectedKeys],
  );

  const onSelectItem = useCallback(
    ({item, isSelected}: {item: T; isSelected: boolean}) => {
      setSelectedKeys(prev => {
        const next = new Set(prev);
        const id = getId(item);
        if (isSelected) {
          next.add(id);
        } else {
          next.delete(id);
        }
        return next;
      });
    },
    [getId, setSelectedKeys],
  );

  const getIsIndeterminate = useCallback(() => {
    const selectedActionableCount = data.filter(
      item =>
        getIsItemSelectableAndEnabled(item) && selectedKeys.has(getId(item)),
    ).length;
    return (
      selectedActionableCount > 0 &&
      selectedActionableCount < selectableIDs.size
    );
  }, [data, getIsItemSelectableAndEnabled, selectedKeys, getId, selectableIDs]);

  const selectionConfig = useMemo(
    (): UseTableSelectionConfig<T> => ({
      getIsItemSelected: item => selectedKeys.has(getId(item)),
      onSelectItem,
      onSelectAll,
      getIsAllSelected: getAllSelected,
      getIsIndeterminate,
      getIsItemSelectable,
      getIsItemEnabled,
    }),
    [
      selectedKeys,
      getId,
      onSelectItem,
      onSelectAll,
      getAllSelected,
      getIsIndeterminate,
      getIsItemSelectable,
      getIsItemEnabled,
    ],
  );

  const clearSelection = useCallback(() => {
    setSelectedKeys(new Set<string>());
  }, [setSelectedKeys]);

  const selectionState = useMemo(
    (): TableSelectionState => ({
      selectedKeys,
      selectedCount: selectedKeys.size,
      hasSelection: selectedKeys.size > 0,
      clearSelection,
    }),
    [selectedKeys, clearSelection],
  );

  return {selectionConfig, selectionState};
}
