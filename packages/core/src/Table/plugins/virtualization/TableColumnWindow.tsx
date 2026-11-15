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
import {
  useMemo,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
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
import type {TableColumnFocusProps} from '../../tableColumnWindowing';
import type {TablePlugin} from '../../types';
import {chainEventHandlers} from '../../../utils/chainEventHandlers';
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
        : input.minWidth != null &&
            resolveTableMinWidth(input.minWidth, floorMinWidth) !==
              `${floorMinWidth}px`
          ? 'a table min-width wider than the column floors changes the column pitch'
          : undefined)
  );
}

/**
 * The column window's own plugin. Placed before the table's plugins, it gives
 * each mounted cell its full-table position and each header its pitch in
 * pixels, so the table's plugins compose over them. A windowed table renders
 * at its minimum width, so a percentage would resolve against the spacers.
 */
function createColumnPositionPlugin(
  pitches: ReadonlyArray<number>,
): TablePlugin {
  return {
    transformHeaderCell: (props, _column, columnIndex) => {
      const {style, ...htmlProps} = props.htmlProps;
      return {
        ...props,
        htmlProps: {
          ...htmlProps,
          'aria-colindex': columnIndex + 1,
          style: {
            width: `${pitches[columnIndex]}px`,
            minWidth: `${pitches[columnIndex]}px`,
            ...style,
          },
        },
      };
    },
    transformBodyCell: (props, _column, _item, columnIndex) => ({
      ...props,
      htmlProps: {'aria-colindex': columnIndex + 1, ...props.htmlProps},
    }),
  };
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
  const columnKeys = useMemo(
    () => columns.map(column => column.key),
    [columns],
  );
  const {segments, isWindowed, focusProps} = useTableColumnWindow({
    initialViewportWidth,
    isAdmitted: reason == null,
    widths: pitches,
    startCount: pinned.startCount,
    endCount: pinned.endCount,
    columnKeys,
    hasRows: input.hasRows,
    table: input.runtime.table,
    viewport: input.runtime.viewport,
    geometry: input.runtime.geometry,
  });
  // One plugin list per set of pitches, so mounted cells keep equal props
  // across a range change.
  const plugins = useMemo(
    () => [createColumnPositionPlugin(pitches), ...input.plugins],
    [pitches, input.plugins],
  );
  const columnCount = columns.length;
  // One layout object per mounted range, so rows that keep their range keep
  // their memoized output.
  const layout = useMemo<TableColumnLayout | undefined>(
    () =>
      isWindowed
        ? {
            segments,
            cellCount: segments.reduce(
              (count, segment) =>
                count +
                (segment.type === 'gap' ? 1 : segment.end - segment.start),
              0,
            ),
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
            plugins,
            tableAttributes: {'aria-colcount': columnCount},
          }
        : undefined,
    [isWindowed, segments, plugins, columnCount],
  );
  // The table's own handlers run first, then the caller's, then the column
  // window's.
  const chainTableHandlers = useMemo(
    () =>
      focusProps == null
        ? undefined
        : (...sources: ReadonlyArray<Partial<TableColumnFocusProps>>) => ({
            onFocus: chainEventHandlers(
              ...sources.map(source => source.onFocus),
              focusProps.onFocus,
            ),
            onBlur: chainEventHandlers(
              ...sources.map(source => source.onBlur),
              focusProps.onBlur,
            ),
            onPointerDown: chainEventHandlers(
              ...sources.map(source => source.onPointerDown),
              focusProps.onPointerDown,
            ),
            onContextMenu: chainEventHandlers(
              ...sources.map(source => source.onContextMenu),
              focusProps.onContextMenu,
            ),
          }),
    [focusProps],
  );
  return render({layout, chainTableHandlers});
}

/** The column windowing a columns capability carries; one object for every capability. */
export const TABLE_COLUMNS_WINDOWING: TableColumnsWindowing = Object.freeze({
  Window: TableColumnWindow,
});
