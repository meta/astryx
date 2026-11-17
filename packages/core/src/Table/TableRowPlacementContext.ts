// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TableRowPlacementContext.ts
 * @input Layer-scoped React context
 * @output Exports TableRowPlacementContext and its fixed values
 * @position Context layer; tells a TableRow whether it is a body row and
 * which stripe it is, so it can carry the `table-row` target's `parity`
 * visual prop and `striped` state
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Table/TableBody.tsx (children-mode provider)
 * - /packages/core/src/Table/BaseTable.tsx (data-mode provider)
 * - /packages/core/src/Table/Table.tsx (reset for nested tables)
 * - /packages/core/src/Table/TableRow.tsx (consumer)
 */

import {createLayerScopedContext} from '../Layer/layerScopedContext';

/** Which stripe a body row is, counted from 1 over body rows. */
export type TableRowParity = 'odd' | 'even';

export interface TableRowPlacement {
  /** The row sits in a table body (not a header or footer). */
  isBodyRow: boolean;
  /** The row's stripe, or null when its position is not known for sure. */
  parity: TableRowParity | null;
}

/** Outside any body: header rows, footer rows, and rows of nested tables. */
export const NOT_BODY_ROW: TableRowPlacement = {
  isBodyRow: false,
  parity: null,
};

/** A body row whose position Core cannot count for sure. */
export const BODY_ROW_UNCOUNTED: TableRowPlacement = {
  isBodyRow: true,
  parity: null,
};

export const ODD_BODY_ROW: TableRowPlacement = {
  isBodyRow: true,
  parity: 'odd',
};

export const EVEN_BODY_ROW: TableRowPlacement = {
  isBodyRow: true,
  parity: 'even',
};

/** The placement of the body row at a 0-based position. */
export function bodyRowPlacement(index: number): TableRowPlacement {
  return index % 2 === 0 ? ODD_BODY_ROW : EVEN_BODY_ROW;
}

export const TableRowPlacementContext =
  createLayerScopedContext<TableRowPlacement>(
    'TableRowPlacementContext',
    1,
    NOT_BODY_ROW,
  );
TableRowPlacementContext.displayName = 'TableRowPlacementContext';
