// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTableColumnWindow.ts
 * @input Admitted column pitches and keys, pinned run sizes, the seed and shared inline geometry
 * @output Stable column and spacer segments in full-table column positions;
 *   it keeps the focused cell's column mounted
 * @position Table's column adapter over the private list-windowing module
 *   (`virtualization/useInlineListWindow`); it maps the windowed run between
 *   the pinned runs and owns no observer. Only the column hook's import
 *   reaches it.
 */
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type RefObject,
  type SyntheticEvent,
} from 'react';
import {useIsomorphicLayoutEffect} from '../../../hooks/useIsomorphicLayoutEffect';
import {useDevWarningPerMessage} from '../../../hooks/useDevWarning';
import {isPositiveFinite} from '../../../virtualization/listWindow';
import {
  useInlineListWindow,
  type InlineListWindowGeometrySource,
} from '../../../virtualization/useInlineListWindow';
import {
  getCellColumnIndex,
  type TableColumnFocusProps,
  type TableColumnSegment,
} from '../../tableColumnWindowing';

export interface UseTableColumnWindowOptions {
  initialViewportWidth: number;
  isAdmitted: boolean;
  /** The pitch of each column, in full-table order. */
  widths: ReadonlyArray<number>;
  /** Columns in the pinned start run, from the first column. */
  startCount: number;
  /** Columns in the pinned end run, through the last column. */
  endCount: number;
  /** Column keys in full-table order: focus and the anchor follow keys. */
  columnKeys: ReadonlyArray<string>;
  /** Whether the body has data rows; an empty-state cell is not a column. */
  hasRows: boolean;
  table: RefObject<HTMLTableElement | null>;
  viewport: RefObject<HTMLDivElement | null>;
  geometry: InlineListWindowGeometrySource;
}
export interface TableColumnWindowResult {
  segments: ReadonlyArray<TableColumnSegment>;
  /** True while at least one column is not mounted. */
  isWindowed: boolean;
  /** The table's focus handlers, while column windowing is admitted. */
  focusProps: TableColumnFocusProps | undefined;
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

/** The cell that holds `target`, and its full-table column index. */
function getFocusedCell(
  table: HTMLTableElement,
  target: EventTarget,
): {cell: HTMLTableCellElement; index: number} | undefined {
  const view = table.ownerDocument.defaultView;
  if (view == null || !(target instanceof view.Element)) {
    return undefined;
  }
  const cell = target.closest('td, th');
  if (!(cell instanceof view.HTMLTableCellElement) || !table.contains(cell)) {
    return undefined;
  }
  const index = getCellColumnIndex(cell);
  return index === undefined ? undefined : {cell, index};
}

export function useTableColumnWindow({
  initialViewportWidth,
  isAdmitted,
  widths,
  startCount,
  endCount,
  columnKeys,
  hasRows,
  table,
  viewport,
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
    columnKeys.length === columnCount &&
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
  // Key work runs when the columns change, never on a scroll.
  const runKeys = useMemo(
    () => columnKeys.slice(runStart, runEnd),
    [columnKeys, runStart, runEnd],
  );
  // The pinned runs always mount and cover the viewport's edges.
  const run = useInlineListWindow({
    keys: runKeys,
    offsets: layout.offsets,
    insetStart: layout.pinnedStart,
    insetEnd: layout.pinnedEnd,
    initialViewportWidth,
    overscan: OVERSCAN,
    canWindow,
    geometry,
    viewport,
    focusContainer: table,
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

  // React focus events reach the table also from a layer that one of its
  // cells renders in a portal, such as a cell menu. Such focus belongs to
  // the cell that opened the layer: the last cell that took focus, a press
  // or a context menu. The hook keeps the opener's column key, so a column
  // change while the layer holds focus keeps the right column. A pinned column
  // always mounts, so it needs no retention. Focus that moves inside the
  // table keeps the column until it lands on another cell.
  const {onItemFocus, onItemBlur} = run;
  const openerKeyRef = useRef<string | undefined>(undefined);
  const onOpenerInput = useCallback(
    (event: SyntheticEvent<HTMLTableElement>) => {
      const opener = getFocusedCell(event.currentTarget, event.target);
      if (opener !== undefined) {
        openerKeyRef.current = columnKeys[opener.index];
      }
    },
    [columnKeys],
  );
  const onFocus = useCallback(
    (event: FocusEvent<HTMLTableElement>) => {
      const element = event.currentTarget;
      const focused = getFocusedCell(element, event.target);
      const key =
        focused !== undefined
          ? columnKeys[focused.index]
          : element.contains(event.target)
            ? undefined
            : openerKeyRef.current;
      if (key === undefined) {
        return;
      }
      openerKeyRef.current = key;
      const index = columnKeys.indexOf(key);
      if (index >= runStart && index < runEnd) {
        onItemFocus(key, focused?.cell ?? event.target);
      } else {
        onItemBlur();
      }
    },
    [columnKeys, runStart, runEnd, onItemFocus, onItemBlur],
  );
  const onBlur = useCallback(
    (event: FocusEvent<HTMLTableElement>) => {
      const leavesDocument =
        event.relatedTarget == null &&
        !event.currentTarget.ownerDocument.hasFocus();
      if (
        !leavesDocument &&
        !event.currentTarget.contains(event.relatedTarget)
      ) {
        onItemBlur();
      }
    },
    [onItemBlur],
  );

  return useMemo(
    () => ({
      segments,
      isWindowed,
      focusProps: canWindow
        ? {
            onFocus,
            onBlur,
            onPointerDown: onOpenerInput,
            onContextMenu: onOpenerInput,
          }
        : undefined,
    }),
    [segments, isWindowed, canWindow, onFocus, onBlur, onOpenerInput],
  );
}
