// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTableColumnWindow.ts
 * @input Admitted column pitches, pinned run sizes, the seed and shared inline geometry
 * @output Stable column and spacer segments in full-table column positions
 * @position Table's column adapter over the private list-windowing module
 *   (`virtualization/useInlineListWindow`); it maps the windowed run between
 *   the pinned runs and owns no observer. Only the column hook's import
 *   reaches it.
 */
import {useMemo, useState, type RefObject} from 'react';
import {useIsomorphicLayoutEffect} from '../../../hooks/useIsomorphicLayoutEffect';
import {useDevWarningPerMessage} from '../../../hooks/useDevWarning';
import {isPositiveFinite} from '../../../virtualization/listWindow';
import {
  useInlineListWindow,
  type InlineListWindowGeometrySource,
} from '../../../virtualization/useInlineListWindow';
import type {TableColumnSegment} from '../../tableColumnWindowing';

export interface UseTableColumnWindowOptions {
  initialViewportWidth: number;
  isAdmitted: boolean;
  /** The pitch of each column, in full-table order. */
  widths: ReadonlyArray<number>;
  /** Columns in the pinned start run, from the first column. */
  startCount: number;
  /** Columns in the pinned end run, through the last column. */
  endCount: number;
  /** Whether the body has data rows; an empty-state cell is not a column. */
  hasRows: boolean;
  table: RefObject<HTMLTableElement | null>;
  geometry: InlineListWindowGeometrySource;
}
export interface TableColumnWindowResult {
  segments: ReadonlyArray<TableColumnSegment>;
  /** True while at least one column is not mounted. */
  isWindowed: boolean;
}

const OVERSCAN = 2;

/** Why mounted header or body cells cannot window, if they cannot. */
function getColumnViolation(table: HTMLTableElement): string | undefined {
  for (const row of Array.from(table.rows)) {
    if (row.getAttribute('aria-hidden') === 'true') {
      continue;
    }
    for (const cell of Array.from(row.cells)) {
      if (cell.getAttribute('aria-hidden') !== 'true' && cell.colSpan > 1) {
        return 'a cell spans columns';
      }
    }
  }
  return undefined;
}

export function useTableColumnWindow({
  initialViewportWidth,
  isAdmitted,
  widths,
  startCount,
  endCount,
  hasRows,
  table,
  geometry,
}: UseTableColumnWindowOptions): TableColumnWindowResult {
  const columnCount = widths.length;
  const runStart = Math.min(columnCount, Math.max(0, startCount));
  const runEnd = Math.max(runStart, columnCount - Math.max(0, endCount));
  const [rejected, setRejected] = useState<{
    widths: ReadonlyArray<number>;
    seed: number;
    reason: string;
  }>();
  const isRejected =
    rejected?.widths === widths && rejected.seed === initialViewportWidth;
  useDevWarningPerMessage(
    'Table',
    `Column windowing disabled: ${rejected?.reason}. Rendering every column.`,
    isRejected,
  );
  const canWindow =
    isAdmitted &&
    !isRejected &&
    isPositiveFinite(initialViewportWidth) &&
    runEnd > runStart &&
    widths.every(width => Number.isFinite(width) && width >= 0);
  // Prefix offsets of the windowed run, and the pinned run sizes.
  const layout = useMemo(() => {
    const offsets = [0];
    for (let index = runStart; index < runEnd; index++) {
      offsets.push(offsets[offsets.length - 1] + widths[index]);
    }
    let pinnedStart = 0;
    for (let index = 0; index < runStart; index++) {
      pinnedStart += widths[index];
    }
    let pinnedEnd = 0;
    for (let index = runEnd; index < columnCount; index++) {
      pinnedEnd += widths[index];
    }
    return {offsets, pinnedStart, pinnedEnd};
  }, [widths, runStart, runEnd, columnCount]);
  // The pinned runs always mount and cover the viewport's edges.
  const run = useInlineListWindow({
    offsets: layout.offsets,
    insetStart: layout.pinnedStart,
    insetEnd: layout.pinnedEnd,
    initialViewportWidth,
    overscan: OVERSCAN,
    canWindow,
    geometry,
  });
  const isWindowed = run.isWindowed;

  const segments = useMemo<TableColumnSegment[]>(() => {
    if (!isWindowed) {
      return columnCount === 0
        ? []
        : [{type: 'columns', start: 0, end: columnCount}];
    }
    const next: TableColumnSegment[] = [];
    if (runStart > 0) {
      next.push({type: 'columns', start: 0, end: runStart});
    }
    for (const segment of run.segments) {
      next.push(
        segment.type === 'gap'
          ? {
              type: 'gap',
              start: runStart + segment.start,
              end: runStart + segment.end,
              width: segment.height,
            }
          : {
              type: 'columns',
              start: runStart + segment.start,
              end: runStart + segment.end,
            },
      );
    }
    if (runEnd < columnCount) {
      next.push({type: 'columns', start: runEnd, end: columnCount});
    }
    return next;
  }, [isWindowed, run.segments, runStart, runEnd, columnCount]);

  // Spanning cells come from plugin transforms, so they are known only after
  // they mount. Reads only mounted cells; one such cell renders every column.
  // A table with no data rows has only the empty-state cell, which spans
  // every column by design, so it is not checked.
  useIsomorphicLayoutEffect(() => {
    if (!isWindowed || !hasRows || table.current == null) {
      return;
    }
    const reason = getColumnViolation(table.current);
    if (reason) {
      // eslint-disable-next-line @eslint-react/set-state-in-effect -- records a violation read from mounted cells
      setRejected({widths, seed: initialViewportWidth, reason});
    }
  }, [isWindowed, hasRows, segments, table, widths, initialViewportWidth]);

  return useMemo(() => ({segments, isWindowed}), [segments, isWindowed]);
}
