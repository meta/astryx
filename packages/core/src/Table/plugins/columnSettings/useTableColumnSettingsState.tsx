// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTableColumnSettingsState.tsx
 * @input React, column settings types
 * @output Exports useTableColumnSettingsState hook and config/return types
 * @position Column settings state helper; manages column visibility and ordering.
 *   Pairs with useTableColumnSettings (plugin hook).
 *
 * Follows the same pattern as useTableSelectionState: the state hook
 * manages operations and produces a config object that feeds directly
 * into the plugin hook. Renderer-agnostic — works with any column
 * picker UI (MultiSelector, drag-and-drop, checkbox list, etc.).
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Table/plugins/columnSettings/index.ts (exports)
 * - /packages/core/src/Table/index.ts (exports)
 */

import {useCallback, useMemo, useRef} from 'react';
import type {ColumnSettingsOption} from './useTableColumnSettings';

// =============================================================================
// Config Type
// =============================================================================

/**
 * Configuration for useTableColumnSettingsState.
 *
 * The consumer owns the active keys state. This hook provides column
 * visibility operations (toggle, show all, reset) and a config object
 * that feeds directly into `useTableColumnSettings`.
 *
 * @template TColumnKey - String literal union of column keys
 *
 * @example
 * ```
 * const [activeKeys, setActiveKeys] = useState(['name', 'email', 'role']);
 * const columnState = useTableColumnSettingsState({
 *   columns: [
 *     { key: 'name', label: 'Name', isAlwaysVisible: true },
 *     { key: 'email', label: 'Email' },
 *     { key: 'role', label: 'Role' },
 *   ],
 *   activeColumnKeys: activeKeys,
 *   onChangeActiveColumnKeys: setActiveKeys,
 * });
 * const plugin = useTableColumnSettings(columnState.columnSettingsConfig);
 * <Table data={data} columns={allColumns} plugins={{ columnSettings: plugin }} />
 * ```
 */
export interface UseTableColumnSettingsStateConfig<
  TColumnKey extends string = string,
> {
  /**
   * All available columns with metadata for the settings UI.
   * This defines the universe of columns the user can toggle.
   */
  columns: ReadonlyArray<ColumnSettingsOption<TColumnKey>>;

  /**
   * Currently active column keys, in display order.
   * Only columns with keys in this array are shown in the table.
   * The array order determines column display order.
   */
  activeColumnKeys: ReadonlyArray<TColumnKey>;

  /**
   * Called when active columns change (toggle, reorder).
   * Consumer updates their own state.
   */
  onChangeActiveColumnKeys: (keys: ReadonlyArray<TColumnKey>) => void;

  /**
   * The default column set for "Reset to default" functionality.
   * When omitted, resetToDefault shows all columns.
   */
  defaultColumnKeys?: ReadonlyArray<TColumnKey>;
}

// =============================================================================
// Return Type
// =============================================================================

/**
 * Return value of useTableColumnSettingsState.
 */
export interface UseTableColumnSettingsStateReturn<
  TColumnKey extends string = string,
> {
  /**
   * Ready-to-use config for useTableColumnSettings.
   * Pass this directly to the plugin hook.
   *
   * @example
   * ```
   * const state = useTableColumnSettingsState({ ... });
   * const plugin = useTableColumnSettings(state.columnSettingsConfig);
   * ```
   */
  columnSettingsConfig: UseTableColumnSettingsStateConfig<TColumnKey>;

  /** Currently active column keys (pass-through from config). */
  activeColumnKeys: ReadonlyArray<TColumnKey>;

  /**
   * Toggle a column's visibility.
   * If the column is active, removes it. If inactive, adds it to the end.
   * No-op for columns with `isAlwaysVisible: true`.
   */
  toggleColumn: (key: TColumnKey) => void;

  /**
   * Whether a specific column is currently active (visible).
   */
  isColumnActive: (key: TColumnKey) => boolean;

  /**
   * Whether a specific column can be toggled.
   * Returns false for columns with `isAlwaysVisible: true`.
   */
  isColumnToggleable: (key: TColumnKey) => boolean;

  /**
   * Show all columns.
   */
  showAllColumns: () => void;

  /**
   * Reset to the default column set.
   * Uses `defaultColumnKeys` if provided, otherwise shows all columns.
   */
  resetToDefault: () => void;

  /**
   * Set active column keys from a list of key strings.
   * Enforces that `isAlwaysVisible` columns remain in the active set.
   * Useful as an `onChange` handler for any list-based column picker.
   */
  setActiveColumnKeys: (keys: string[]) => void;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Headless column visibility and ordering state management.
 *
 * Manages which columns are active, provides toggle/reset operations,
 * and produces a config object for `useTableColumnSettings`.
 * Renderer-agnostic — pair with any column picker UI.
 *
 * @example
 * ```
 * const [activeKeys, setActiveKeys] = useState(['name', 'email']);
 * const state = useTableColumnSettingsState({
 *   columns: [
 *     { key: 'name', label: 'Name', isAlwaysVisible: true },
 *     { key: 'email', label: 'Email' },
 *     { key: 'role', label: 'Role' },
 *   ],
 *   activeColumnKeys: activeKeys,
 *   onChangeActiveColumnKeys: setActiveKeys,
 * });
 * const plugin = useTableColumnSettings(state.columnSettingsConfig);
 * <Table data={data} columns={allColumns} plugins={{ columnSettings: plugin }} />
 * ```
 */
export function useTableColumnSettingsState<
  TColumnKey extends string = string,
>(
  config: UseTableColumnSettingsStateConfig<TColumnKey>,
): UseTableColumnSettingsStateReturn<TColumnKey> {
  const {columns, activeColumnKeys} = config;

  // Keep config in a ref so callbacks always read the latest version.
  const configRef = useRef(config);
  configRef.current = config;

  // Build lookup sets for fast checks
  const activeSet = useMemo(
    () => new Set(activeColumnKeys),
    [activeColumnKeys],
  );

  const alwaysVisibleSet = useMemo(
    () => new Set(columns.filter(c => c.isAlwaysVisible).map(c => c.key)),
    [columns],
  );

  // --- Column operations ---

  const toggleColumn = useCallback((key: TColumnKey) => {
    const cfg = configRef.current;
    const avSet = new Set(
      cfg.columns.filter(c => c.isAlwaysVisible).map(c => c.key),
    );
    if (avSet.has(key)) {
      return;
    }

    const currentKeys = cfg.activeColumnKeys;
    const currentSet = new Set(currentKeys);
    if (currentSet.has(key)) {
      cfg.onChangeActiveColumnKeys(currentKeys.filter(k => k !== key));
    } else {
      cfg.onChangeActiveColumnKeys([...currentKeys, key]);
    }
  }, []);

  const isColumnActive = useCallback(
    (key: TColumnKey) => activeSet.has(key),
    [activeSet],
  );

  const isColumnToggleable = useCallback(
    (key: TColumnKey) => !alwaysVisibleSet.has(key),
    [alwaysVisibleSet],
  );

  const showAllColumns = useCallback(() => {
    const cfg = configRef.current;
    cfg.onChangeActiveColumnKeys(cfg.columns.map(c => c.key));
  }, []);

  const resetToDefault = useCallback(() => {
    const cfg = configRef.current;
    if (cfg.defaultColumnKeys) {
      cfg.onChangeActiveColumnKeys([...cfg.defaultColumnKeys]);
    } else {
      cfg.onChangeActiveColumnKeys(cfg.columns.map(c => c.key));
    }
  }, []);

  const setActiveColumnKeys = useCallback((value: string[]) => {
    const cfg = configRef.current;
    const avSet = new Set(
      cfg.columns.filter(c => c.isAlwaysVisible).map(c => c.key),
    );
    // Ensure always-visible columns remain in the set
    const valueSet = new Set(value);
    for (const key of avSet) {
      valueSet.add(key);
    }
    cfg.onChangeActiveColumnKeys(
      Array.from(valueSet) as unknown as TColumnKey[],
    );
  }, []);

  return {
    columnSettingsConfig: config,
    activeColumnKeys,
    toggleColumn,
    isColumnActive,
    isColumnToggleable,
    showAllColumns,
    resetToDefault,
    setActiveColumnKeys,
  };
}
