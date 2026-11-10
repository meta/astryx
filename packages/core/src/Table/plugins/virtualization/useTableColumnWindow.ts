// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTableColumnWindow.ts
 * @input Admitted column pitches and keys, pinned run sizes, the seed and shared inline geometry
 * @output Stable column and spacer segments in full-table column positions, and
 *   table focus handlers that keep the focused cell's column
 * @position Table's column adapter over the private list-windowing module
 *   (`virtualization/useInlineListWindow`); it maps the windowed run between
 *   the pinned runs and owns no observer
 */
import {
  useCallback,
  useMemo,
  useState,
  type FocusEvent,
  type RefObject,
} from 'react';
import {useIsomorphicLayoutEffect} from '../../../hooks/useIsomorphicLayoutEffect';
import {useDevWarningPerMessage} from '../../../hooks/useDevWarning';
import {isPositiveFinite} from '../../../virtualization/listWindow';
import {
  useInlineListWindow,
  type InlineListWindowGeometry,
  type InlineListWindowGeometrySource,
} from '../../../virtualization/useInlineListWindow';
import {
  getTableVirtualizationConfig,
  type TableVirtualizationCapability,
} from './useTableRowsVirtualization';
import {
  getTableColumnsVirtualizationConfig,
  type UseTableColumnsVirtualizationConfig,
} from './useTableColumnsVirtualization';

export type TableColumnSegment =
  | {type: 'columns'; start: number; end: number}
  | {type: 'gap'; start: number; end: number; width: number};

export type TableInlineGeometry = InlineListWindowGeometry;
export type TableInlineGeometrySource = InlineListWindowGeometrySource;

export interface ResolvedTableVirtualization {
  /** The rows capability, passed on to the row planner unchanged. */
  rows?: TableVirtualizationCapability;
  columns?: Readonly<UseTableColumnsVirtualizationConfig>;
  /** Why the value cannot window at all. */
  invalidReason?: string;
}

/** One capability, or a list with at most one per axis. */
export function resolveTableVirtualization(
  value: unknown,
): ResolvedTableVirtualization {
  if (value == null) {
    return {};
  }
  const isList = Array.isArray(value);
  let rows: TableVirtualizationCapability | undefined;
  let columns: Readonly<UseTableColumnsVirtualizationConfig> | undefined;
  for (const item of isList ? (value as unknown[]) : [value]) {
    const columnsConfig = getTableColumnsVirtualizationConfig(item);
    if (getTableVirtualizationConfig(item) != null) {
      if (rows != null) {
        return {
          invalidReason:
            'a virtualization list holds more than one rows capability',
        };
      }
      rows = item as TableVirtualizationCapability;
    } else if (columnsConfig != null) {
      if (columns != null) {
        return {
          invalidReason:
            'a virtualization list holds more than one columns capability',
        };
      }
      columns = columnsConfig;
    } else {
      return {
        invalidReason: isList
          ? 'a virtualization list holds a value that is not a windowing capability'
          : 'virtualization is not a value from useTableRowsVirtualization or useTableColumnsVirtualization',
      };
    }
  }
  return {rows, columns};
}

export interface UseTableColumnWindowOptions {
  config: Readonly<UseTableColumnsVirtualizationConfig> | undefined;
  isAdmitted: boolean;
  /** The pitch of each column, in full-table order. */
  widths: ReadonlyArray<number>;
  /** Columns in the pinned start run, from the first column. */
  startCount: number;
  /** Columns in the pinned end run, through the last column. */
  endCount: number;
  /** Column keys in full-table order: focus and the anchor follow keys. */
  columnKeys: ReadonlyArray<string>;
  table: RefObject<HTMLTableElement | null>;
  viewport: RefObject<HTMLDivElement | null>;
  geometry: TableInlineGeometrySource;
}
export interface TableColumnWindowResult {
  segments: ReadonlyArray<TableColumnSegment>;
  /** True while at least one column is not mounted. */
  isWindowed: boolean;
  /** True while column windowing is admitted, so focus is tracked. */
  isActive: boolean;
  onFocus: (event: FocusEvent<HTMLTableElement>) => void;
  /** Releases the focused column only when focus leaves the table. */
  onBlur: (event: FocusEvent<HTMLTableElement>) => void;
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

/**
 * The cell that holds `target`, and its full-table column index. A windowed
 * cell carries its position; an unwindowed row has no spacers, so there the
 * cell index is the column index.
 */
function getFocusedCell(
  table: HTMLTableElement,
  target: EventTarget,
): {cell: HTMLTableCellElement; index: number} | undefined {
  const view = table.ownerDocument.defaultView;
  if (view == null || !(target instanceof view.Element)) {
    return undefined;
  }
  const cell = target.closest('td, th');
  if (
    !(cell instanceof view.HTMLTableCellElement) ||
    !table.contains(cell) ||
    cell.getAttribute('aria-hidden') === 'true'
  ) {
    return undefined;
  }
  const position = cell.getAttribute('aria-colindex');
  return {
    cell,
    index: position == null ? cell.cellIndex : Number(position) - 1,
  };
}

export function useTableColumnWindow({
  config,
  isAdmitted,
  widths,
  startCount,
  endCount,
  columnKeys,
  table,
  viewport,
  geometry,
}: UseTableColumnWindowOptions): TableColumnWindowResult {
  const columnCount = widths.length;
  const runStart = Math.min(columnCount, Math.max(0, startCount));
  const runEnd = Math.max(runStart, columnCount - Math.max(0, endCount));
  const [rejected, setRejected] = useState<{
    widths: ReadonlyArray<number>;
    config: Readonly<UseTableColumnsVirtualizationConfig> | undefined;
    reason: string;
  }>();
  const isRejected = rejected?.widths === widths && rejected.config === config;
  useDevWarningPerMessage(
    'Table',
    `Column windowing disabled: ${rejected?.reason}. Rendering every column.`,
    isRejected,
  );
  const canWindow =
    isAdmitted &&
    !isRejected &&
    config !== undefined &&
    isPositiveFinite(config.initialViewportWidth) &&
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
    initialViewportWidth: config?.initialViewportWidth ?? 0,
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
  useIsomorphicLayoutEffect(() => {
    if (!isWindowed || table.current == null) {
      return;
    }
    const reason = getColumnViolation(table.current);
    if (reason) {
      // eslint-disable-next-line @eslint-react/set-state-in-effect -- records a violation read from mounted cells
      setRejected({widths, config, reason});
    }
  }, [isWindowed, segments, table, widths, config]);

  const {onItemFocus, onItemBlur} = run;
  const onFocus = useCallback(
    (event: FocusEvent<HTMLTableElement>) => {
      const focused = getFocusedCell(event.currentTarget, event.target);
      const index = focused?.index;
      if (focused === undefined || index === undefined) {
        return;
      }
      // A pinned column always mounts, so it needs no retention.
      if (index >= runStart && index < runEnd) {
        onItemFocus(columnKeys[index], focused.cell);
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
    () => ({segments, isWindowed, isActive: canWindow, onFocus, onBlur}),
    [segments, isWindowed, canWindow, onFocus, onBlur],
  );
}
