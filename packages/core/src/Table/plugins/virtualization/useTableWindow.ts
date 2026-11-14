// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTableWindow.ts
 * @input Parent-admitted data/keys, parent-owned shared geometry source and DOM refs
 * @output Table's admission into the shared list window, logical-position
 *   column widths and mounted-row diagnostics, reading cells by column
 *   position beside column spacers
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
import {getCellAtColumn, getCellColumnIndex} from '../../tableColumnWindowing';

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
  /** The declared config, so a measured pitch change keeps the fallback. */
  config: Readonly<UseTableRowsVirtualizationConfig>;
  reason: string;
}
interface MeasuredPitch {
  declared: Readonly<UseTableRowsVirtualizationConfig>;
  rowHeight: number;
}
const EMPTY_LOGICAL_POSITION_COLUMNS: ReadonlySet<number> = new Set();
const EMPTY_POSITION_WIDTHS: ReadonlyMap<number, number> = new Map();

function roundPixels(value: number): number {
  return Math.round(value * 100) / 100;
}

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

/** The font and the chrome around the text in a logical-position cell. */
interface LogicalPositionMetrics {
  font: string;
  spacing: number;
  chrome: number;
}

/**
 * The font, letter spacing, padding and borders of a logical-position cell.
 * It reads computed styles only, so it adds no layout read and no DOM write.
 * Undefined when the cell has no text or no resolved font.
 */
function readLogicalPositionMetrics(
  cell: HTMLTableCellElement,
): LogicalPositionMetrics | undefined {
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
  return {font, spacing, chrome};
}

/**
 * The column width that fits `text` at the given metrics, from canvas text
 * metrics. Undefined when the text cannot be measured.
 */
function getLogicalPositionWidth(
  {font, spacing, chrome}: LogicalPositionMetrics,
  text: string,
): number | undefined {
  const textWidth = measureText(font, text);
  if (textWidth === undefined || !(textWidth > 0)) {
    return undefined;
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

/** Rows within this distance of each other, or of the pitch, share one pitch. */
const PITCH_TOLERANCE = 0.75;
/** A shared height closer than this to the pitch is the pitch. */
const PITCH_EPSILON = 0.01;

type GeometryCheck = {reason: string} | {pitch: number} | undefined;

function getContentViolation(
  row: HTMLTableRowElement,
  logicalPositionColumns: ReadonlySet<number>,
): string | undefined {
  for (const cell of Array.from(row.cells)) {
    const columnIndex = getCellColumnIndex(cell);
    if (columnIndex === undefined) {
      continue;
    }
    if (logicalPositionColumns.has(columnIndex) && hasClippedRowNumber(cell)) {
      return 'Mounted row-number content exceeds the column width.';
    }
    if (cell.clientHeight > 0 && cell.scrollHeight > cell.clientHeight + 1) {
      return 'Mounted cell content exceeds the declared fixed height.';
    }
  }
  return undefined;
}

/**
 * The pitch every mounted row shares after a text-size, zoom or theme change,
 * or why the rows cannot share one. Reads every mounted row once.
 */
function measureSharedPitch(
  rows: HTMLTableRowElement[],
  logicalPositionColumns: ReadonlySet<number>,
): GeometryCheck {
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  let sum = 0;
  let count = 0;
  for (const row of rows) {
    const height = row.getBoundingClientRect().height;
    if (!(height > 0)) {
      continue;
    }
    const reason = getContentViolation(row, logicalPositionColumns);
    if (reason) {
      return {reason};
    }
    min = Math.min(min, height);
    max = Math.max(max, height);
    sum += height;
    count++;
  }
  if (count === 0) {
    return undefined;
  }
  if (max - min > PITCH_TOLERANCE) {
    return {reason: 'Mounted rows have different heights.'};
  }
  return {pitch: sum / count};
}

/**
 * Diagnostics inspect only mounted native rows/cells; all observers belong to Table.
 * Rows in `checkedRows` passed since the last layout invalidation, so a
 * content change reads only newly mounted rows, until one leaves the pitch.
 */
function getGeometryCheck(
  body: HTMLTableSectionElement,
  viewport: HTMLDivElement,
  table: HTMLTableElement,
  rowHeight: number,
  totalHeight: number,
  logicalPositionColumns: ReadonlySet<number>,
  checkedRows: WeakSet<HTMLTableRowElement>,
  checkExtent: boolean,
): GeometryCheck {
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
  const rows = Array.from(body.rows).filter(
    row => row.getAttribute('aria-hidden') !== 'true',
  );
  let shouldCheckExtent = checkExtent;
  for (const row of rows) {
    if (checkedRows.has(row)) {
      continue;
    }
    const height = row.getBoundingClientRect().height;
    // A row that left the pitch: if every mounted row moved together, as after
    // a text-size, zoom or theme change, their height becomes the pitch.
    if (height > 0 && Math.abs(height - rowHeight) > PITCH_TOLERANCE) {
      const shared = measureSharedPitch(rows, logicalPositionColumns);
      if (
        shared === undefined ||
        'reason' in shared ||
        Math.abs(shared.pitch - rowHeight) > PITCH_TOLERANCE
      ) {
        return shared;
      }
      // The rows still share this pitch and their content fits, so only the
      // extent can show the difference.
      for (const mounted of rows) {
        checkedRows.add(mounted);
      }
      shouldCheckExtent = true;
      break;
    }
    const reason = getContentViolation(row, logicalPositionColumns);
    if (reason) {
      return {reason};
    }
    checkedRows.add(row);
  }
  if (shouldCheckExtent) {
    const bodyHeight = body.getBoundingClientRect().height;
    if (!isPositiveFinite(bodyHeight)) {
      return undefined;
    }
    if (
      Math.abs(bodyHeight - totalHeight) > 1 ||
      (viewport.scrollHeight > 0 && totalHeight > viewport.scrollHeight + 1)
    ) {
      // Rows that each moved by less than the tolerance still add up across
      // the body, so a height they share becomes the pitch.
      const shared = measureSharedPitch(rows, logicalPositionColumns);
      if (
        shared !== undefined &&
        ('reason' in shared ||
          Math.abs(shared.pitch - rowHeight) > PITCH_EPSILON)
      ) {
        return shared;
      }
      return {
        reason:
          'The browser cannot represent the declared body extent or fixed row pitch.',
      };
    }
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
  const declared = getTableVirtualizationConfig(capability);
  // The pitch every mounted row shares when it differs from rowHeight, as
  // after a text-size, zoom or theme change. A new capability drops it.
  const [measuredPitch, setMeasuredPitch] = useState<MeasuredPitch>();
  const config = useMemo(
    () =>
      declared !== undefined && measuredPitch?.declared === declared
        ? Object.freeze({...declared, rowHeight: measuredPitch.rowHeight})
        : declared,
    [declared, measuredPitch],
  );
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
    declared !== undefined &&
    calculateListWindow({
      rowCount: data.length,
      rowHeight: declared.rowHeight,
      viewportHeight: declared.initialViewportHeight,
      scrollTop: 0,
      startOffset: 0,
      isMeasured: false,
    }) !== null;
  const isRejected =
    violation?.data === data &&
    violation.keys === keys &&
    violation.config === declared;
  const canWindow =
    isAdmitted &&
    hasValidConfig &&
    !isRejected &&
    keys.length === data.length &&
    data.length > 0;
  const [positionWidths, setPositionWidths] = useState(EMPTY_POSITION_WIDTHS);
  const positionMetricsRef = useRef(new Map<number, LogicalPositionMetrics>());
  const validationRef = useRef<ValidationState | null>(null);
  useDevWarningPerMessage(
    'Table',
    `${violation?.reason} Rendering all rows without fixed constraints.`,
    isRejected,
  );
  useDevWarningPerMessage(
    'Table',
    `Rows measure ${roundPixels(config?.rowHeight ?? 0)}px, not rowHeight ${roundPixels(declared?.rowHeight ?? 0)}px. Windowing uses the measured height.`,
    config !== declared,
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
          // A column windowed out keeps the font and padding last read from
          // it, so its width still fits the current row count.
          const cell = getCellAtColumn(row, index);
          const metrics =
            cell == null
              ? positionMetricsRef.current.get(index)
              : readLogicalPositionMetrics(cell);
          if (cell != null && metrics !== undefined) {
            positionMetricsRef.current.set(index, metrics);
          }
          const width =
            metrics === undefined
              ? positionWidths.get(index)
              : getLogicalPositionWidth(metrics, String(data.length));
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
    const check = getGeometryCheck(
      body.current,
      viewport.current,
      table.current,
      config.rowHeight,
      totalHeight,
      logicalPositionColumns,
      state.checkedRows,
      checkExtent,
    );
    if (check === undefined || declared === undefined) {
      return;
    }
    if ('pitch' in check) {
      setMeasuredPitch(
        Math.abs(check.pitch - declared.rowHeight) < PITCH_EPSILON
          ? undefined
          : {declared, rowHeight: check.pitch},
      );
    } else {
      setViolation({data, keys, config: declared, reason: check.reason});
    }
  }, [
    isWindowed,
    config,
    declared,
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
