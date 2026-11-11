// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTableWindow.ts
 * @input Parent-admitted data/keys, parent-owned shared geometry source and DOM refs
 * @output Table's admission into the shared list window, logical-position
 *   column widths and mounted-row diagnostics
 * @position Table's adapter over the private list-windowing hook
 *   (`virtualization/useListWindow`); DOM refs are effect resources, with no
 *   owned observation
 */
import {useMemo, useRef, useState, type RefObject} from 'react';
import {useIsomorphicLayoutEffect} from '../../../hooks/useIsomorphicLayoutEffect';
import {useDevWarningPerMessage} from '../../../hooks/useDevWarning';
import {
  calculateListWindow,
  isPositiveFinite,
  type ListWindowSegment,
} from '../../../virtualization/listWindow';
import {measureText, readPixels} from '../../../virtualization/measure';
import {
  useListWindow,
  type ListWindowGeometry,
  type ListWindowGeometrySource,
} from '../../../virtualization/useListWindow';
import {
  getTableVirtualizationConfig,
  type TableVirtualizationCapability,
  type UseTableRowsVirtualizationConfig,
} from './useTableRowsVirtualization';

export type TableWindowGeometry = ListWindowGeometry;
export type TableWindowGeometrySource = ListWindowGeometrySource;
export interface UseTableWindowOptions<T> {
  capability: TableVirtualizationCapability | undefined;
  data: T[];
  keys: (string | number)[];
  isAdmitted: boolean;
  logicalPositionColumns?: ReadonlySet<number>;
  viewport: RefObject<HTMLDivElement | null>;
  body: RefObject<HTMLTableSectionElement | null>;
  table: RefObject<HTMLTableElement | null>;
  geometry: TableWindowGeometrySource;
}
export interface TableWindowResult {
  segments: ListWindowSegment[];
  /**
   * Measured column widths, by column index, that fit the last logical row
   * position in each logical-position column. Empty when not windowed.
   */
  logicalPositionWidths: ReadonlyMap<number, number>;
  isWindowed: boolean;
  isFixedHeight: boolean;
  onRowFocus: (key: string | number, focusTarget?: HTMLElement) => void;
  /** Parent invokes only for genuine departure, including its recognized layer ownership. */
  onRowBlur: () => void;
}
interface ValidationState {
  data: unknown[];
  keys: (string | number)[];
  config: Readonly<UseTableRowsVirtualizationConfig>;
  logicalPositionColumns: ReadonlySet<number>;
  checkedRows: WeakSet<HTMLTableRowElement>;
  layoutRevision: number | undefined;
  isPositionWidthMeasured: boolean;
  totalHeight: number;
}
interface Violation {
  data: unknown[];
  keys: (string | number)[];
  config: Readonly<UseTableRowsVirtualizationConfig>;
  reason: string;
}
const EMPTY_LOGICAL_POSITION_COLUMNS: ReadonlySet<number> = new Set();
const EMPTY_POSITION_WIDTHS: ReadonlyMap<number, number> = new Map();

function areWidthsEqual(
  a: ReadonlyMap<number, number>,
  b: ReadonlyMap<number, number>,
): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const [index, width] of a) {
    const other = b.get(index);
    if (other === undefined || Math.abs(other - width) > 0.5) {
      return false;
    }
  }
  return true;
}

/**
 * The column width that fits `text` in a logical-position cell, at the cell's
 * own font, padding and density. It reads computed styles and canvas text
 * metrics only, so it adds no layout read and no DOM write. Undefined when it
 * cannot be measured.
 */
function measureLogicalPositionWidth(
  cell: HTMLTableCellElement,
  text: string,
): number | undefined {
  const view = cell.ownerDocument.defaultView;
  if (view == null) {
    return undefined;
  }
  const walker = cell.ownerDocument.createTreeWalker(
    cell,
    view.NodeFilter.SHOW_TEXT,
  );
  let host: HTMLElement | null = null;
  for (let node = walker.nextNode(); node != null; node = walker.nextNode()) {
    if (node.textContent?.trim()) {
      host = node.parentElement;
      break;
    }
  }
  if (host == null) {
    return undefined;
  }
  const style = view.getComputedStyle(host);
  if (style.fontSize === '' || style.fontFamily === '') {
    return undefined;
  }
  const font = [style.fontStyle, style.fontWeight, style.fontSize]
    .filter(part => part !== '')
    .concat(style.fontFamily)
    .join(' ');
  const textWidth = measureText(font, text);
  if (textWidth === undefined || !(textWidth > 0)) {
    return undefined;
  }
  const spacing =
    style.letterSpacing === 'normal' ? 0 : readPixels(style.letterSpacing);
  // Padding and borders between the text and the column edge.
  let chrome = 0;
  for (
    let element: HTMLElement | null = host;
    element != null && cell.contains(element);
    element = element.parentElement
  ) {
    const box = element === host ? style : view.getComputedStyle(element);
    chrome +=
      readPixels(box.paddingLeft) +
      readPixels(box.paddingRight) +
      readPixels(box.borderLeftWidth) +
      readPixels(box.borderRightWidth);
  }
  return Math.ceil(textWidth + spacing * text.length + chrome + 1);
}

function hasClippedRowNumber(cell: HTMLTableCellElement): boolean {
  const view = cell.ownerDocument.defaultView;
  if (view == null) {
    return false;
  }
  const walker = cell.ownerDocument.createTreeWalker(
    cell,
    view.NodeFilter.SHOW_TEXT,
  );
  const range = cell.ownerDocument.createRange();
  if (typeof range.getBoundingClientRect !== 'function') {
    return false;
  }
  for (let text = walker.nextNode(); text != null; text = walker.nextNode()) {
    range.selectNodeContents(text);
    const width = range.getBoundingClientRect().width;
    if (width <= 0) {
      continue;
    }
    for (
      let parent = text.parentElement;
      parent != null && cell.contains(parent);
      parent = parent.parentElement
    ) {
      if (parent.clientWidth <= 0) {
        continue;
      }
      const style = view.getComputedStyle(parent);
      const available =
        parent.clientWidth -
        (Number.parseFloat(style.paddingLeft) || 0) -
        (Number.parseFloat(style.paddingRight) || 0);
      if (width > available + 1) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Diagnostics inspect only mounted native rows/cells; all observers belong to Table.
 * Rows in `checkedRows` passed since the last layout invalidation, so only
 * newly mounted rows are read.
 */
function getGeometryViolation(
  body: HTMLTableSectionElement,
  viewport: HTMLDivElement,
  table: HTMLTableElement,
  rowHeight: number,
  totalHeight: number,
  logicalPositionColumns: ReadonlySet<number>,
  checkedRows: WeakSet<HTMLTableRowElement>,
  checkExtent: boolean,
): string | undefined {
  if (
    !body.isConnected ||
    !viewport.isConnected ||
    !table.isConnected ||
    !table.contains(body) ||
    !viewport.contains(table) ||
    viewport.clientHeight <= 0
  ) {
    return undefined;
  }
  if (checkExtent) {
    const bodyHeight = body.getBoundingClientRect().height;
    if (!isPositiveFinite(bodyHeight)) {
      return undefined;
    }
    if (
      Math.abs(bodyHeight - totalHeight) > 1 ||
      (viewport.scrollHeight > 0 && totalHeight > viewport.scrollHeight + 1)
    ) {
      return 'The browser cannot represent the declared body extent or fixed row pitch.';
    }
  }
  for (const row of Array.from(body.rows)) {
    if (row.getAttribute('aria-hidden') === 'true' || checkedRows.has(row)) {
      continue;
    }
    const height = row.getBoundingClientRect().height;
    if (height > 0 && Math.abs(height - rowHeight) > 0.75) {
      return 'Mounted row pitch does not match rowHeight.';
    }
    for (const [columnIndex, cell] of Array.from(row.cells).entries()) {
      if (
        logicalPositionColumns.has(columnIndex) &&
        hasClippedRowNumber(cell)
      ) {
        return 'Mounted row-number content exceeds the column width.';
      }
      if (cell.clientHeight > 0 && cell.scrollHeight > cell.clientHeight + 1) {
        return 'Mounted cell content exceeds the declared fixed height.';
      }
    }
    checkedRows.add(row);
  }
  return undefined;
}

export function useTableWindow<T>({
  capability,
  data,
  keys,
  isAdmitted,
  logicalPositionColumns = EMPTY_LOGICAL_POSITION_COLUMNS,
  viewport,
  body,
  table,
  geometry,
}: UseTableWindowOptions<T>): TableWindowResult {
  const [violation, setViolation] = useState<Violation | undefined>();
  const config = getTableVirtualizationConfig(capability);
  // The engine plans its first window from the declared first-frame height.
  const pitch = useMemo(
    () =>
      config === undefined
        ? undefined
        : {
            rowHeight: config.rowHeight,
            viewportHeight: config.initialViewportHeight,
          },
    [config],
  );
  const hasValidConfig =
    config !== undefined &&
    calculateListWindow({
      rowCount: data.length,
      rowHeight: config.rowHeight,
      viewportHeight: config.initialViewportHeight,
      scrollTop: 0,
      startOffset: 0,
      isMeasured: false,
    }) !== null;
  const isRejected =
    violation?.data === data &&
    violation.keys === keys &&
    violation.config === config;
  const canWindow =
    isAdmitted &&
    hasValidConfig &&
    !isRejected &&
    keys.length === data.length &&
    data.length > 0;
  const [positionWidths, setPositionWidths] = useState(EMPTY_POSITION_WIDTHS);
  const validationRef = useRef<ValidationState | null>(null);
  useDevWarningPerMessage(
    'Table',
    `${violation?.reason} Rendering all rows without fixed constraints.`,
    isRejected,
  );
  const {
    segments,
    plan,
    isWindowed,
    snapshot,
    onItemFocus: onRowFocus,
    onItemBlur: onRowBlur,
  } = useListWindow({
    items: data,
    keys,
    rowCount: data.length,
    pitch,
    isEligible: hasValidConfig && isAdmitted,
    canWindow,
    geometry,
    viewport,
    focusContainer: body,
  });

  const totalHeight = plan?.totalHeight ?? 0;
  const revision = snapshot.revision;
  const layoutRevision = snapshot.layoutRevision;
  // Validates after mount, on changed inputs and on each content or layout
  // invalidation. Newly mounted rows cause a content invalidation, which the
  // shared measurement publishes after its own layout reads. So a scroll
  // commit reads no layout, and this check reads an already clean layout.
  useIsomorphicLayoutEffect(() => {
    if (
      !isWindowed ||
      !config ||
      !body.current ||
      !viewport.current ||
      !table.current
    ) {
      validationRef.current = null;
      return;
    }
    let state = validationRef.current;
    if (
      state === null ||
      state.data !== data ||
      state.keys !== keys ||
      state.config !== config ||
      state.logicalPositionColumns !== logicalPositionColumns
    ) {
      state = {
        data,
        keys,
        config,
        logicalPositionColumns,
        checkedRows: new WeakSet(),
        layoutRevision: undefined,
        isPositionWidthMeasured: false,
        totalHeight: Number.NaN,
      };
      validationRef.current = state;
    }
    const isLayoutChanged = state.layoutRevision !== layoutRevision;
    // Size logical-position columns for the last position before its row
    // mounts. A new width re-renders the table and returns before this pass
    // records anything, so the next pass runs every check below.
    if (
      (isLayoutChanged || !state.isPositionWidthMeasured) &&
      logicalPositionColumns.size > 0
    ) {
      const row = Array.from(body.current.rows).find(
        candidate => candidate.getAttribute('aria-hidden') !== 'true',
      );
      if (row) {
        state.isPositionWidthMeasured = true;
        const next = new Map<number, number>();
        for (const index of logicalPositionColumns) {
          const cell = row.cells[index];
          const width =
            cell == null
              ? undefined
              : measureLogicalPositionWidth(cell, String(data.length));
          if (width !== undefined) {
            next.set(index, width);
          }
        }
        if (!areWidthsEqual(positionWidths, next)) {
          setPositionWidths(next);
          return;
        }
      }
    }
    // A size, font, or outer class or style change can clip rows that passed
    // before, so every mounted row is read again. A mounted row is a content
    // invalidation only, and reads only the new rows.
    if (isLayoutChanged) {
      state.checkedRows = new WeakSet();
    }
    const checkExtent = isLayoutChanged || state.totalHeight !== totalHeight;
    state.layoutRevision = layoutRevision;
    state.totalHeight = totalHeight;
    const reason = getGeometryViolation(
      body.current,
      viewport.current,
      table.current,
      config.rowHeight,
      totalHeight,
      logicalPositionColumns,
      state.checkedRows,
      checkExtent,
    );
    if (reason) {
      setViolation({data, keys, config, reason});
    }
  }, [
    isWindowed,
    config,
    data,
    keys,
    logicalPositionColumns,
    totalHeight,
    revision,
    layoutRevision,
    positionWidths,
    body,
    viewport,
    table,
  ]);

  const logicalPositionWidths = isWindowed
    ? positionWidths
    : EMPTY_POSITION_WIDTHS;
  return useMemo(
    () => ({
      segments,
      logicalPositionWidths,
      isWindowed,
      isFixedHeight: isWindowed,
      onRowFocus,
      onRowBlur,
    }),
    [segments, logicalPositionWidths, isWindowed, onRowFocus, onRowBlur],
  );
}
