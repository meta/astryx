// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTableColumnSettings.tsx
 * @input React, Table types
 * @output Exports useTableColumnSettings plugin hook and types
 * @position Column settings plugin; consumed by Table via plugins prop
 *
 * Pure plugin hook — takes column settings config, returns a TablePlugin
 * that filters and reorders columns via `transformColumns`.
 *
 * For state management (toggle, reset, visibility checks), use
 * `useTableColumnSettingsState` which produces the config this hook needs.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Table/plugins/columnSettings/index.ts (exports)
 * - /packages/core/src/Table/index.ts (exports)
 */

import {useMemo, useRef} from 'react';
import type {TablePlugin, TableColumn} from '../../types';
import type {UseTableColumnSettingsStateConfig} from './useTableColumnSettingsState';

// =============================================================================
// Config Types
// =============================================================================

/**
 * Definition of a column for the column settings UI.
 * Separate from TableColumn because the settings UI needs metadata
 * (label, group, disableability) that the table column doesn't carry.
 */
export interface ColumnSettingsOption<TColumnKey extends string = string> {
  /** Column key — must match TableColumn.key */
  key: TColumnKey;
  /** Human-readable label for the column settings UI */
  label: string;
  /**
   * Whether this column can be hidden.
   * When true, the column is always visible and its checkbox is disabled.
   * Use for essential columns like "Name" or "ID".
   *
   * @default false
   */
  isAlwaysVisible?: boolean;
  /**
   * Optional group name for organized column lists.
   * Columns with the same group are rendered together under a heading.
   */
  group?: string;
}

/**
 * Configuration for useTableColumnSettings.
 *
 * This is the same shape as UseTableColumnSettingsStateConfig —
 * you can pass `state.columnSettingsConfig` directly, or construct
 * it manually if you don't need the state hook.
 *
 * @template TColumnKey - String literal union of column keys
 */
export type UseTableColumnSettingsConfig<
  TColumnKey extends string = string,
> = UseTableColumnSettingsStateConfig<TColumnKey>;

// =============================================================================
// Plugin Hook
// =============================================================================

/**
 * Column settings table plugin — filters and reorders columns based on
 * the active column keys.
 *
 * Returns a `TablePlugin` directly (same pattern as `useTableSortable`,
 * `useTableSelection`, etc.).
 *
 * @example
 * ```
 * const state = useTableColumnSettingsState({ columns, activeColumnKeys, onChangeActiveColumnKeys });
 * const plugin = useTableColumnSettings(state.columnSettingsConfig);
 * <Table columns={allColumns} plugins={{ columnSettings: plugin }} />
 * ```
 */
export function useTableColumnSettings<
  T extends Record<string, unknown>,
  TColumnKey extends string = string,
>(config: UseTableColumnSettingsConfig<TColumnKey>): TablePlugin<T> {
  // Keep config in a ref so the plugin reads the latest values
  // without changing plugin identity.
  const configRef = useRef(config);
  configRef.current = config;

  return useMemo(
    (): TablePlugin<T> => ({
      transformColumns(columns: TableColumn<T>[]): TableColumn<T>[] {
        const cfg = configRef.current;
        const activeSet = new Set(cfg.activeColumnKeys);
        // Build a map for ordering by activeColumnKeys position
        const orderMap = new Map(
          cfg.activeColumnKeys.map((key, index) => [key, index]),
        );
        return columns
          .filter(col => activeSet.has(col.key as TColumnKey))
          .sort((a, b) => {
            const orderA = orderMap.get(a.key as TColumnKey) ?? Infinity;
            const orderB = orderMap.get(b.key as TColumnKey) ?? Infinity;
            return orderA - orderB;
          });
      },
    }),
    [],
  );
}
