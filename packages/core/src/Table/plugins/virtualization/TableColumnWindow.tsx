// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TableColumnWindow.tsx
 * @input What BaseTable gives the column window, and the seed
 * @output The column window component the columns capability carries
 * @position Column windowing behind its hook. Only the hook's import reaches
 *   this module and the column planner, so a Table that never imports the
 *   hook carries none of it.
 */
import {useMemo, type ReactElement, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {useDevWarningPerMessage} from '../../../hooks/useDevWarning';
import {
  resolveColumnFloorWidths,
  resolveColumnWidths,
  resolveTableMinWidth,
} from '../../columnUtils';
import {resolvePinnedColumnRuns} from '../../tablePinnedColumnRuns';
import type {
  TableColumnLayout,
  TableColumnSegment,
  TableColumnWindowInput,
  TableColumnWindowProps,
  TableColumnsWindowing,
} from '../../tableColumnWindowing';
import {useTableColumnWindow} from './useTableColumnWindow';

const styles = stylex.create({
  spacer: (width: number) => ({
    width,
    minWidth: width,
    maxWidth: width,
    padding: 0,
    borderWidth: 0,
  }),
});

/**
 * An inaccessible native cell that keeps the place of unmounted columns. The
 * header row and every body row render the same spacers, so columns align.
 */
function renderColumnSpacer(
  segment: Extract<TableColumnSegment, {type: 'gap'}>,
): ReactElement {
  return (
    <td
      key={`\u0000spacer:${segment.start}`}
      aria-hidden="true"
      {...stylex.props(styles.spacer(segment.width))}
    />
  );
}

/** Why the columns cannot window, before the planner runs. */
function getColumnFallbackReason(
  input: TableColumnWindowInput,
  seed: number,
  floorMinWidth: number,
): string | undefined {
  return (
    input.fallbackReason ??
    (!input.hasFixedHeightColumns
      ? 'a custom cell renderer has no single-line admission'
      : !(Number.isFinite(seed) && seed > 0)
        ? 'the inline viewport seed must be a positive finite CSS pixel width'
        : input.isRowsWindowing
          ? 'windowing rows and columns together comes in a later release'
          : input.minWidth != null &&
              resolveTableMinWidth(input.minWidth, floorMinWidth) !==
                `${floorMinWidth}px`
            ? 'a table min-width wider than the column floors changes the column pitch'
            : undefined)
  );
}

function TableColumnWindow({
  capability,
  input,
  render,
}: TableColumnWindowProps): ReactNode {
  const {columns} = input;
  const initialViewportWidth = capability?.initialViewportWidth ?? 0;
  // Column pitch is the width each column renders at the table's minimum
  // width, the same widths pinned offsets use.
  const {pitches, floorMinWidth} = useMemo(() => {
    const floors = resolveColumnFloorWidths(columns);
    return {
      pitches: columns.map(column => floors.get(column.key) ?? 0),
      floorMinWidth: resolveColumnWidths([...columns]).tableMinWidth,
    };
  }, [columns]);
  const reason = getColumnFallbackReason(
    input,
    initialViewportWidth,
    floorMinWidth,
  );
  useDevWarningPerMessage(
    'Table',
    `Column windowing disabled: ${reason}. Rendering every column.`,
    reason != null,
  );
  const pinned = resolvePinnedColumnRuns(input.plugins, columns);
  const {segments, isWindowed} = useTableColumnWindow({
    initialViewportWidth,
    isAdmitted: reason == null,
    widths: pitches,
    startCount: pinned.startCount,
    endCount: pinned.endCount,
    hasRows: input.hasRows,
    table: input.runtime.table,
    geometry: input.runtime.geometry,
  });
  // One layout object per mounted range, so rows that keep their range keep
  // their memoized output.
  const layout = useMemo<TableColumnLayout | undefined>(
    () =>
      isWindowed
        ? {
            segments,
            // A windowed table renders at its minimum width, so each mounted
            // column takes its pitch in pixels: a percentage would resolve
            // against the spacers.
            widthOf: columnIndex => ({
              width: `${pitches[columnIndex]}px`,
              minWidth: `${pitches[columnIndex]}px`,
            }),
            mapColumns: (rowColumns, renderCell) =>
              segments.flatMap(segment =>
                segment.type === 'gap'
                  ? [renderColumnSpacer(segment)]
                  : rowColumns
                      .slice(segment.start, segment.end)
                      .map((column, offset) =>
                        renderCell(column, segment.start + offset),
                      ),
              ),
          }
        : undefined,
    [isWindowed, segments, pitches],
  );
  return render(layout);
}

/** The column windowing a columns capability carries; one object for every capability. */
export const TABLE_COLUMNS_WINDOWING: TableColumnsWindowing = Object.freeze({
  Window: TableColumnWindow,
});
