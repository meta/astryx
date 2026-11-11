// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TableContext.ts
 * @input Layer-scoped React context
 * @output Exports TableContext and TableContextValue
 * @position Context layer; connects Table styling to sub-components (TableRow, TableCell)
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Table/Table.tsx (provider)
 * - /packages/core/src/Table/TableRow.tsx (consumer)
 * - /packages/core/src/Table/TableCell.tsx (consumer)
 * - /packages/core/src/Table/index.ts (exports if types change)
 */

import {createLayerScopedContext} from '../Layer/layerScopedContext';
import type {TableVerticalAlign} from './types';

export interface TableContextValue {
  density: 'compact' | 'balanced' | 'spacious';
  dividers: 'rows' | 'columns' | 'grid' | 'none';
  isStriped: boolean;
  hasHover: boolean;
  stickyHeader: boolean;
  verticalAlign: TableVerticalAlign;
  textOverflow: 'wrap' | 'truncate';
}

export const TableContext = createLayerScopedContext<TableContextValue | null>(
  'TableContext',
  1,
  null,
);
TableContext.displayName = 'TableContext';
