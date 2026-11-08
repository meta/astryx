// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file Private fixed-height column admission.
 * @input First-party columns whose structural renderer is owned and bounded.
 * @output Identity-based admission without a new caller assertion prop.
 * @position Shared Table protocol, with actual pitch validated after mount.
 */
import type {ReactNode} from 'react';
import type {TableColumn} from './types';
const heightSafe = new WeakMap<object, boolean>();
const logicalRenderers = new WeakMap<
  object,
  (logicalIndex: number) => ReactNode
>();
/** Admits a first-party column to fixed-height windowing. */
export function registerFixedHeightColumn<T extends Record<string, unknown>>(
  column: TableColumn<T>,
  isCompatible = true,
  renderLogicalPosition?: (logicalIndex: number) => ReactNode,
): void {
  heightSafe.set(column, isCompatible);
  if (renderLogicalPosition != null) {
    logicalRenderers.set(column, renderLogicalPosition);
  }
}

/**
 * Widens logical-position columns to the measured widths, by column index,
 * that fit the last position. A column keeps a declared width that already
 * fits. Returns `columns` itself when no column changes.
 */
export function withLogicalPositionWidths<T extends Record<string, unknown>>(
  columns: TableColumn<T>[],
  widths: ReadonlyMap<number, number>,
): TableColumn<T>[] {
  if (widths.size === 0) {
    return columns;
  }
  let isChanged = false;
  const next = columns.map((column, index) => {
    const width = widths.get(index);
    if (
      width === undefined ||
      logicalRenderers.get(column) == null ||
      (column.width?.type === 'pixel' && width <= column.width.value)
    ) {
      return column;
    }
    isChanged = true;
    return {...column, width: {type: 'pixel' as const, value: width}};
  });
  return isChanged ? next : columns;
}
/**
 * The table variable that carries the extra width a windowed table gives the
 * logical-position column at `index`, so pinned offsets can include it.
 */
export function getLogicalPositionExtraVar(index: number): string {
  return `--_table-logical-extra-${index}`;
}
export function getLogicalPositionRenderer<T extends Record<string, unknown>>(
  column: TableColumn<T>,
): ((logicalIndex: number) => ReactNode) | undefined {
  return logicalRenderers.get(column);
}
export function isFixedHeightColumn<T extends Record<string, unknown>>(
  column: TableColumn<T>,
): boolean {
  return column.renderCell == null || heightSafe.get(column) === true;
}
