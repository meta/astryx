// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file Fixed-height column admission.
 * @input Columns whose structural renderer is known to keep a uniform row pitch.
 * @output Identity-based admission for Table row windowing.
 * @position Shared Table protocol, with actual pitch validated after mount.
 */
import type {ReactNode} from 'react';
import {realmValue, sharedKey} from '../utils/sharedRealm';
import type {TableColumn} from './types';

type LogicalPositionRenderer = (logicalIndex: number) => ReactNode;
type FixedHeightColumnRegistration = {
  isCompatible: boolean;
  renderLogicalPosition?: LogicalPositionRenderer;
};

// A swizzled Table and the package copy must see the same admission. Keep the
// registration in the shared realm, just like the virtualization capability.
const registrations = realmValue(
  sharedKey('table/fixed-height-columns', 1),
  () => new WeakMap<object, FixedHeightColumnRegistration>(),
);

function registerFixedHeightColumnInternal<T extends Record<string, unknown>>(
  column: TableColumn<T>,
  isCompatible: boolean,
  renderLogicalPosition?: LogicalPositionRenderer,
): void {
  registrations.set(column, {isCompatible, renderLogicalPosition});
}
/**
 * Admits a custom-rendered column to fixed-height row windowing.
 *
 * Call this only when the renderer keeps the same row height for every item.
 */
export function registerFixedHeightColumn<T extends Record<string, unknown>>(
  column: TableColumn<T>,
): void {
  registerFixedHeightColumnInternal(column, true);
}

/** Internal admission for first-party columns with logical-position output. */
export {registerFixedHeightColumnInternal};

/** Preserve admission when a first-party transform creates a column copy. */
export function copyFixedHeightColumnRegistration<
  T extends Record<string, unknown>,
>(source: TableColumn<T>, copy: TableColumn<T>): void {
  const registration = registrations.get(source);
  if (registration != null) {
    registrations.set(copy, registration);
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
      registrations.get(column)?.renderLogicalPosition == null ||
      (column.width?.type === 'pixel' && width <= column.width.value)
    ) {
      return column;
    }
    isChanged = true;
    const copy = {...column, width: {type: 'pixel' as const, value: width}};
    copyFixedHeightColumnRegistration(column, copy);
    return copy;
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
): LogicalPositionRenderer | undefined {
  return registrations.get(column)?.renderLogicalPosition;
}
export function isFixedHeightColumn<T extends Record<string, unknown>>(
  column: TableColumn<T>,
): boolean {
  return (
    column.renderCell == null ||
    registrations.get(column)?.isCompatible === true
  );
}
