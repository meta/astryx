// Copyright (c) Meta Platforms, Inc. and affiliates.
'use client';

/**
 * @file tableWindowingImpl.ts
 * @input BaseTable's resolved mode, wrapper, row model, identity, columns and
 *   runtime, and the virtualization capability
 * @output Table's windowing implementation: admission, the list window,
 *   row-number widths and the geometry driver
 * @position Registered in Table's windowing slot by
 *   `useTableRowsVirtualization`, so only an app that makes a capability
 *   carries this code
 */
import {useMemo, type ReactNode} from 'react';
import {resolveColumnFloorWidths} from '../../columnUtils';
import {
  getLogicalPositionExtraVar,
  getLogicalPositionRenderer,
  isFixedHeightColumn,
  withLogicalPositionWidths,
} from '../../tableColumnAdmission';
import {
  createTableRuntime,
  isTableScrollWrapperOwned,
} from '../../tableRuntime';
import type {
  TableWindow,
  TableWindowInput,
  TableWindowProps,
  TableWindowing,
} from '../../tableWindowing';
import type {TableColumn} from '../../types';
import {createTableGeometryDriver} from './tableGeometry';
import {getTableVirtualizationConfig} from './useTableRowsVirtualization';
import {useTableWindow} from './useTableWindow';

const NO_EXTRA_STYLE: Readonly<Record<string, string>> = Object.freeze({});

function useWindowedTable<T extends Record<string, unknown>>({
  virtualization,
  mode,
  scrollWrapper,
  rowModel,
  data,
  identity,
  keys,
  textOverflow,
  hasLegacyRowMetadata,
  columns,
  runtime,
}: TableWindowInput<T>): TableWindow<T> {
  const config = getTableVirtualizationConfig(virtualization);
  const fallbackReason = useMemo(() => {
    if (virtualization != null && config == null) {
      return 'virtualization is not a value from useTableRowsVirtualization';
    }
    if (mode !== 'data') {
      return 'windowing requires data mode';
    }
    if (scrollWrapper == null) {
      return 'windowing requires the Table scroll wrapper';
    }
    if (!isTableScrollWrapperOwned(scrollWrapper)) {
      return 'windowing requires the Table-owned scroll wrapper';
    }
    if (rowModel !== 'flat') {
      return "structural body modifiers must declare rowModel: 'flat' to admit windowing";
    }
    if (!identity.every(row => row.identityStatus === 'valid')) {
      return 'explicit unique valid row identity is required';
    }
    if (textOverflow === 'wrap') {
      return 'explicit wrapped content is not fixed-height';
    }
    if (hasLegacyRowMetadata) {
      return 'legacy row offsets or counts conflict with windowed metadata';
    }
    if (!columns.every(isFixedHeightColumn)) {
      return 'a custom cell renderer has no fixed-height admission';
    }
    if (
      config == null ||
      !Number.isFinite(config.rowHeight) ||
      config.rowHeight <= 0 ||
      !Number.isFinite(config.initialViewportHeight) ||
      config.initialViewportHeight <= 0
    ) {
      return 'row and viewport geometry must be positive finite CSS pixels';
    }
    return undefined;
  }, [
    virtualization,
    mode,
    scrollWrapper,
    rowModel,
    identity,
    textOverflow,
    hasLegacyRowMetadata,
    columns,
    config,
  ]);
  const logicalPositionColumns = useMemo(
    () =>
      new Set(
        columns.flatMap((column, index) =>
          getLogicalPositionRenderer(column) == null ? [] : [index],
        ),
      ),
    [columns],
  );
  const windowPlan = useTableWindow({
    capability: virtualization,
    data,
    keys,
    isAdmitted: fallbackReason === undefined,
    logicalPositionColumns,
    viewport: runtime.viewport,
    body: runtime.body,
    table: runtime.table,
    geometry: runtime.geometry,
  });

  // Fixed layout sizes columns from the header, so rows keep their columns;
  // pinned offsets read the extra width from a table variable.
  const sizedColumns = withLogicalPositionWidths(
    columns,
    windowPlan.logicalPositionWidths,
  );
  let extraStyle = NO_EXTRA_STYLE;
  if (sizedColumns !== columns) {
    const extra: Record<string, string> = {};
    const floors = resolveColumnFloorWidths(columns);
    const sizedFloors = resolveColumnFloorWidths(sizedColumns);
    sizedColumns.forEach((column: TableColumn<T>, index) => {
      const width =
        (sizedFloors.get(column.key) ?? 0) - (floors.get(column.key) ?? 0);
      if (width > 0) {
        extra[getLogicalPositionExtraVar(index)] = `${width}px`;
      }
    });
    extraStyle = extra;
  }
  return {
    segments: windowPlan.segments,
    isWindowed: windowPlan.isWindowed,
    rowHeight: windowPlan.isWindowed ? config?.rowHeight : undefined,
    viewportHeight: windowPlan.isWindowed
      ? config?.initialViewportHeight
      : undefined,
    columns: sizedColumns,
    extraStyle,
    onRowFocus: windowPlan.isWindowed ? windowPlan.onRowFocus : undefined,
    onRowBlur: windowPlan.isWindowed ? windowPlan.onRowBlur : undefined,
    fallbackReason: virtualization == null ? undefined : fallbackReason,
  };
}

function WindowedTable<T extends Record<string, unknown>>({
  input,
  render,
}: TableWindowProps<T>): ReactNode {
  return render(useWindowedTable(input));
}

export const tableWindowing: TableWindowing = Object.freeze({
  createRuntime: () => createTableRuntime(createTableGeometryDriver),
  Window: WindowedTable,
});
