// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTableRowIndex.tsx
 * @input React, StyleX, Table types, and each body row's TableRowContext
 * @output Exports useTableRowIndex hook + config type
 * @position Row-index plugin; consumed by Table via plugins prop
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Table/index.ts (exports)
 */

import {useMemo, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {colorVars, typeScaleVars} from '../../../theme/tokens.stylex';

import type {TableColumn, TablePlugin} from '../../types';

/**
 * Configuration for {@link useTableRowIndex}.
 *
 * Without `data`, the plugin numbers each body row from the position Table
 * gives it. With `data`, numbers follow that array, as before.
 */
export interface UseTableRowIndexConfig<T extends Record<string, unknown>> {
  /**
   * Optional: the array whose order the numbers follow. Omit it to number
   * rows from the positions Table gives them.
   */
  data?: T[];
  /**
   * Optional key extractor returning a **unique** string per row, used with
   * `data`. When provided, rows match `data` by the returned string (stable
   * across new object identities); otherwise by reference identity. For a
   * stable plugin identity across renders, memoize this with `useCallback`.
   */
  getRowKey?: (item: T) => string;
  /** Header label for the index column. @default '#' */
  label?: ReactNode;
  /** First index value. @default 1 */
  startFrom?: number;
}

const INDEX_COLUMN_KEY = '__rowIndex';
const INDEX_COLUMN_WIDTH = {type: 'pixel' as const, value: 48};

const styles = stylex.create({
  index: {
    fontFamily: 'var(--font-family-code)',
    fontSize: typeScaleVars['--text-supporting-size'],
    fontVariantNumeric: 'tabular-nums',
    color: colorVars['--color-text-secondary'],
  },
});

/**
 * Returns a {@link TablePlugin} that prepends a right-aligned, monospaced
 * row-number column. Numbering follows the rows the table renders, so it
 * reflects the current sort / filter / pagination view.
 *
 * @example
 * ```
 * const rowIndex = useTableRowIndex();
 * <Table data={data} columns={columns} idKey="id" plugins={{rowIndex}} />;
 * ```
 */
export function useTableRowIndex<T extends Record<string, unknown>>(
  config: UseTableRowIndexConfig<T> = {},
): TablePlugin<T> {
  const {data, getRowKey, label = '#', startFrom = 1} = config;

  // The lookup into a caller's `data`. Keyed by getRowKey when provided
  // (stable across new object identities), otherwise by object reference.
  const lookup = useMemo(() => {
    if (data == null) {
      return null;
    }
    const map = new Map<unknown, number>();
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      map.set(getRowKey ? getRowKey(item) : item, i);
    }
    return (item: T): number | undefined =>
      map.get(getRowKey ? getRowKey(item) : item);
  }, [data, getRowKey]);

  return useMemo((): TablePlugin<T> => {
    // Table runs each cell's transforms just before it renders that cell. So
    // the index cell's renderer reads the position that its own transform
    // stored.
    const positions = new WeakMap<T, number>();
    return {
      rowModel: 'flat',
      transformBodyCell(props, column, item, _columnIndex, _columns, context) {
        if (lookup == null && column.key === INDEX_COLUMN_KEY && context) {
          positions.set(item, context.logicalIndex);
        }
        return props;
      },
      transformColumns(columns) {
        const indexColumn: TableColumn<T> = {
          key: INDEX_COLUMN_KEY,
          header: label,
          width: INDEX_COLUMN_WIDTH,
          align: 'end',
          resizable: false,
          renderCell: (item: T) => {
            const idx = lookup == null ? positions.get(item) : lookup(item);
            if (idx == null) {
              return null;
            }
            return (
              <span {...stylex.props(styles.index)}>{idx + startFrom}</span>
            );
          },
        };
        return [indexColumn, ...columns];
      },
    };
  }, [label, startFrom, lookup]);
}
