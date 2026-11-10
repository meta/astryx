// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file Private fixed-height column admission and pinned column runs.
 * @input First-party columns and plugins that declare bounded renderers or pinned runs.
 * @output Identity-based admission and pinned runs without a new caller prop.
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

/** Column counts in the pinned start and end runs. */
export interface PinnedColumnRuns {
  startCount: number;
  endCount: number;
}
type PinnedRunResolver = (
  columns: ReadonlyArray<TableColumn<Record<string, unknown>>>,
) => PinnedColumnRuns;
const pinnedRunResolvers = new WeakMap<object, PinnedRunResolver>();

/**
 * Lets a first-party plugin that pins columns tell Table its pinned runs, so
 * column windowing keeps them mounted without reading the plugin's config.
 */
export function registerPinnedColumnRuns(
  plugin: object,
  resolve: PinnedRunResolver,
): void {
  pinnedRunResolvers.set(plugin, resolve);
}

/** The widest pinned start and end runs that the plugins declare. */
export function resolvePinnedColumnRuns<T extends Record<string, unknown>>(
  plugins: ReadonlyArray<object>,
  columns: ReadonlyArray<TableColumn<T>>,
): PinnedColumnRuns {
  let startCount = 0;
  let endCount = 0;
  for (const plugin of plugins) {
    const runs = pinnedRunResolvers.get(plugin)?.(
      columns as ReadonlyArray<TableColumn<Record<string, unknown>>>,
    );
    if (runs != null) {
      startCount = Math.max(startCount, runs.startCount);
      endCount = Math.max(endCount, runs.endCount);
    }
  }
  return {startCount, endCount};
}
