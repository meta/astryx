// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tableColumnWindowing.ts
 * @input A `Table.virtualization` value
 * @output The rows capability, the columns capability with the column
 *   windowing it carries, or why the value cannot window; the mapping between
 *   mounted cells and full-table column positions
 * @position Table's base wiring for column windowing. The column hook puts
 *   its implementation in the capability value, so a Table that never
 *   imports the hook carries only this wiring, not the column planner,
 *   the inline window or the spacer cells.
 */
import type {
  FocusEventHandler,
  MouseEventHandler,
  PointerEventHandler,
  ReactElement,
  ReactNode,
  RefObject,
} from 'react';
import {sharedKey} from '../utils/sharedRealm';
import type {InlineListWindowGeometrySource} from '../virtualization/useInlineListWindow';
import type {TableColumn} from './types';
import {
  getTableVirtualizationConfig,
  type TableVirtualizationCapability,
} from './plugins/virtualization/useTableRowsVirtualization';

// A registered key, so a swizzled Table reads a capability the package's hook
// made, and the package reads a copy's. It differs from the rows key, so each
// reader accepts only its own axis.
export const COLUMNS_CAPABILITY = sharedKey(
  'table/columns-virtualization-capability',
  1,
);

export type TableColumnSegment =
  | {type: 'columns'; start: number; end: number}
  | {type: 'gap'; start: number; end: number; width: number};

/** How a windowed table lays out its columns. */
export interface TableColumnLayout {
  /** Columns that mount and spacers between them, in full-table order. */
  segments: ReadonlyArray<TableColumnSegment>;
  /** Cells in one mounted row: pinned and mounted cells, and spacers. */
  cellCount: number;
  /** The header width style of the column at a full-table index. */
  widthOf: (columnIndex: number) => {width: string; minWidth: string};
  /** Builds the cells of one row: mounted cells and native spacers. */
  mapColumns: <C>(
    columns: ReadonlyArray<C>,
    renderCell: (column: C, columnIndex: number) => ReactElement,
  ) => ReactElement[];
}

/** What BaseTable gives the column window before it renders the table. */
export interface TableColumnWindowInput {
  /** Why both axes cannot window, before any column-only check. */
  fallbackReason: string | undefined;
  /** Whether every resolved column has single-line admission. */
  hasFixedHeightColumns: boolean;
  /** Columns with their widths resolved, in full-table order. */
  columns: ReadonlyArray<TableColumn<never>>;
  plugins: ReadonlyArray<object>;
  /** A min-width the caller or a plugin set on the table. */
  minWidth: string | number | undefined;
  hasRows: boolean;
  runtime: {
    table: RefObject<HTMLTableElement | null>;
    viewport: RefObject<HTMLDivElement | null>;
    geometry: InlineListWindowGeometrySource;
  };
}

/**
 * Handlers the column window gives the table element: focus tracking, and
 * the press or context menu that names the cell a layer belongs to.
 */
export interface TableColumnFocusProps {
  onFocus: FocusEventHandler<HTMLTableElement>;
  onBlur: FocusEventHandler<HTMLTableElement>;
  onPointerDown: PointerEventHandler<HTMLTableElement>;
  onContextMenu: MouseEventHandler<HTMLTableElement>;
}

export interface TableColumnWindowProps {
  /** The columns capability's value. */
  capability: Readonly<TableColumnsCapabilityValue> | undefined;
  input: TableColumnWindowInput;
  /** Renders the table; a windowed table gets its column layout. */
  render: (
    layout: TableColumnLayout | undefined,
    focusProps?: TableColumnFocusProps,
  ) => ReactNode;
}

/** The column windowing a columns capability carries. */
export interface TableColumnsWindowing {
  /**
   * Plans the columns and renders the table for them. A component, so the
   * implementation keeps its hooks behind its own boundary; adding or
   * removing the capability changes the component and remounts the table.
   */
  Window: (props: TableColumnWindowProps) => ReactNode;
}

export interface TableColumnsCapabilityValue {
  initialViewportWidth: number;
  windowing: TableColumnsWindowing;
}

/** The columns capability's value, or undefined for any other value. */
export function getTableColumnsVirtualizationConfig(
  capability: unknown,
): Readonly<TableColumnsCapabilityValue> | undefined {
  return typeof capability === 'object' &&
    capability !== null &&
    COLUMNS_CAPABILITY in capability
    ? (capability as Record<symbol, TableColumnsCapabilityValue>)[
        COLUMNS_CAPABILITY
      ]
    : undefined;
}

export interface ResolvedTableVirtualization {
  rows?: TableVirtualizationCapability;
  columns?: Readonly<TableColumnsCapabilityValue>;
  /** Why the value cannot window at all. */
  invalidReason?: string;
}

/** One capability, or a list with at most one per axis. */
export function resolveTableVirtualization(
  value: unknown,
): ResolvedTableVirtualization {
  const resolved: ResolvedTableVirtualization = {};
  for (const item of Array.isArray(value)
    ? value
    : value == null
      ? []
      : [value]) {
    const columns = getTableColumnsVirtualizationConfig(item);
    if (getTableVirtualizationConfig(item) != null && resolved.rows == null) {
      resolved.rows = item as TableVirtualizationCapability;
    } else if (columns != null && resolved.columns == null) {
      resolved.columns = columns;
    } else {
      return {
        invalidReason:
          'virtualization is not a value from useTableRowsVirtualization or useTableColumnsVirtualization, or a virtualization list with at most one of each',
      };
    }
  }
  return resolved;
}

/**
 * The full-table column index of a mounted cell. A windowed cell carries its
 * position. An unwindowed row has no spacers, so there the cell index is the
 * column index. A spacer has no column.
 */
export function getCellColumnIndex(
  cell: HTMLTableCellElement,
): number | undefined {
  if (cell.getAttribute('aria-hidden') === 'true') {
    return undefined;
  }
  const position = cell.getAttribute('aria-colindex');
  return position == null ? cell.cellIndex : Number(position) - 1;
}

/** The cell of a mounted row at a full-table column index, if it is mounted. */
export function getCellAtColumn(
  row: HTMLTableRowElement,
  columnIndex: number,
): HTMLTableCellElement | undefined {
  return Array.from(row.cells).find(
    cell => getCellColumnIndex(cell) === columnIndex,
  );
}
