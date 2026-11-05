// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input Imports from Table component files
 * @output Exports all Table components, types, and utilities
 * @position Component entry point; re-exported by /packages/core/src/index.ts
 *
 * SYNC: When modified, update this header and /packages/core/src/Table/Table.doc.mjs
 */

import type {IconName} from '../Icon';
import type {TableRowStatusColor} from './plugins/rowStatus/useTableRowStatus';

/** Stable custom row-status marker contract. */
export interface TableRowStatus {
  color: TableRowStatusColor | (string & {});
  icon?: IconName;
  label: string;
}

/** Semantic row outcome resolved through the active theme. */
export interface TableSemanticRowStatus {
  status: 'success' | 'warning' | 'error';
  color?: never;
  icon?: never;
  label: string;
}

export {Table} from './Table';
export {TableRow} from './TableRow';
export {TableCell} from './TableCell';
export {TableHeaderCell} from './TableHeaderCell';
export {TableHeader} from './TableHeader';
export {TableBody} from './TableBody';
export {TableFooter} from './TableFooter';
export {TableContext} from './TableContext';
export {TableSelectionToolbar} from './TableSelectionToolbar';
export {useTableSelection} from './plugins/selection';
export {useTableSelectionState} from './plugins/selection';
export {useTableSortable} from './plugins/sortable';
export {useTableSortableState} from './plugins/sortable';
export {useTablePagination, paginateData} from './plugins/pagination';
export {useTableColumnSettings} from './plugins/columnSettings';
export {useTableColumnSettingsState} from './plugins/columnSettings';
export {useTableColumnResize} from './plugins/columnResize';
export {useTableStickyColumns} from './plugins/stickyColumns';
export {useTableGroupedRows} from './plugins/groupedRows';
export {useTableRowIndex} from './plugins/rowIndex';
export {useTableRowStatus} from './plugins/rowStatus';
export {useTableRowExpansion} from './plugins/rowExpansion';
export {useTableTreeData, useTableTreeState} from './plugins/tree';
export {resolveContextActions} from './tableContextMenu';
export {
  useTableFiltering,
  useTableFilterState,
  toSearchFilters,
} from './plugins/filtering';
export {useBaseTablePlugins} from './useBaseTablePlugins';
export {
  proportional,
  pixel,
  generateColumns,
  resolveColumnWidths,
  DEFAULT_MIN_COLUMN_WIDTH,
} from './columnUtils';
export type {
  TableColumn,
  TableColumnAlign,
  TableVerticalAlign,
  ColumnWidth,
  ProportionalWidth,
  PixelWidth,
  TablePlugin,
  TableContextAction,
  TableContextActions,
  TableRenderProps,
  HeaderRowRenderProps,
  HeaderCellRenderProps,
  BodyRowRenderProps,
  BodyCellRenderProps,
  ScrollWrapperRenderProps,
  BaseTableProps,
} from './types';
export type {
  TableProps,
  TableDensity,
  TableDividers,
  TableTextOverflow,
} from './Table';
export type {TableRowProps} from './TableRow';
export type {TableCellProps} from './TableCell';
export type {TableHeaderCellProps} from './TableHeaderCell';
export type {TableHeaderProps} from './TableHeader';
export type {TableBodyProps} from './TableBody';
export type {TableFooterProps} from './TableFooter';
export type {TableContextValue} from './TableContext';
export type {TableSelectionToolbarProps} from './TableSelectionToolbar';
export type {UseTableSelectionConfig} from './plugins/selection';
export type {
  TableSelectionState,
  UseTableSelectionStateConfig,
  UseTableSelectionStateResult,
} from './plugins/selection';
export type {
  UseTableSortableConfig,
  UseTableSortableStateConfig,
  UseTableSortableStateResult,
  TableSortComparator,
  TableSortDirection,
  TableSortEntry,
  TableSortState,
} from './plugins/sortable';
export type {TableSortableColumnConfig} from './types';
export type {UseTablePaginationConfig} from './plugins/pagination';
export type {
  UseTableColumnSettingsConfig,
  ColumnSettingsOption,
} from './plugins/columnSettings';
export type {
  UseTableColumnSettingsStateConfig,
  UseTableColumnSettingsStateReturn,
} from './plugins/columnSettings';
export type {UseTableColumnResizeConfig} from './plugins/columnResize';
export type {UseTableStickyColumnsConfig} from './plugins/stickyColumns';
export type {UseTableRowExpansionConfig} from './plugins/rowExpansion';
export type {UseTableRowIndexConfig} from './plugins/rowIndex';
export type {
  UseTableGroupedRowsConfig,
  UseTableGroupedRowsResult,
} from './plugins/groupedRows';
export type {UseTableRowStatusConfig} from './plugins/rowStatus';
export type {
  TableTreeRowMeta,
  UseTableTreeDataConfig,
  UseTableTreeStateConfig,
  UseTableTreeStateResult,
} from './plugins/tree';
export type {
  UseTableFilteringConfig,
  TableFilterState,
  TableFilterVariant,
  TableFilterValue,
  TableFilterFieldRef,
} from './plugins/filtering';
