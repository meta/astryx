// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTableWindow.ts
 * @input Parent-admitted data/keys, parent-owned shared geometry source and DOM refs
 * @output React-tracked stable row/gap plan, one focus island and fixed-mode status
 * @position Table pre-cell planner; DOM refs are effect resources, with no owned observation
 */
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import {useIsomorphicLayoutEffect} from '../../../hooks/useIsomorphicLayoutEffect';
import {
  moveFocusLeftBehind,
  noteFocusWithin,
  type FocusWithin,
} from '../../../utils/focusReturn';
import {useInteractionModalityTrackingFor} from '../../../utils/interactionModality';
import {useDevWarningPerMessage} from '../../../hooks/useDevWarning';
import {
  calculateTableWindow,
  createTableWindowSegments,
  isPositiveFinite,
  reconcileTableAnchor,
  type TableWindowPlan,
  type WindowSegment,
} from './tableWindow';
import {
  getTableVirtualizationConfig,
  type TableVirtualizationCapability,
  type UseTableRowsVirtualizationConfig,
} from './useTableRowsVirtualization';

export interface TableWindowGeometry {
  /** Actual unobscured body viewport height; sticky occlusion is accounted for once by Table. */
  viewportHeight: number;
  scrollTop: number;
  /** Native scroll content extent, including after-table chrome when measured. */
  scrollHeight?: number;
  /** Effective body origin in the same coordinate space as scrollTop. */
  bodyOffset: number;
  isMeasured: boolean;
}
export interface TableWindowGeometrySource {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => TableWindowGeometry;
  getServerSnapshot: () => TableWindowGeometry;
}
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
  segments: WindowSegment[];
  isWindowed: boolean;
  isFixedHeight: boolean;
  onRowFocus: (key: string | number, focusTarget?: HTMLElement) => void;
  /** Parent invokes only for genuine departure, including its recognized layer ownership. */
  onRowBlur: () => void;
}
interface RenderedWindow {
  data: unknown[];
  keys: (string | number)[];
  config: Readonly<UseTableRowsVirtualizationConfig>;
  geometry: TableWindowGeometry;
  plan: TableWindowPlan;
}
interface PendingAnchor {
  snapshot: TableWindowGeometry;
  to: number;
}
interface WindowTracking {
  source: TableWindowGeometrySource;
  snapshot: TableWindowGeometry;
  window: RenderedWindow;
  pending: PendingAnchor | undefined;
}
interface Violation {
  data: unknown[];
  keys: (string | number)[];
  config: Readonly<UseTableRowsVirtualizationConfig>;
  reason: string;
}
const EMPTY_GEOMETRY: TableWindowGeometry = Object.freeze({
  viewportHeight: 0,
  scrollTop: 0,
  bodyOffset: 0,
  isMeasured: false,
});
const EMPTY_LOGICAL_POSITION_COLUMNS: ReadonlySet<number> = new Set();
const getEmptyGeometry = () => EMPTY_GEOMETRY;
const subscribeToNothing = () => () => {};

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

/** Diagnostics inspect only mounted native rows/cells; all observers belong to Table. */
function getGeometryViolation(
  body: HTMLTableSectionElement,
  viewport: HTMLDivElement,
  table: HTMLTableElement,
  rowHeight: number,
  totalHeight: number,
  logicalPositionColumns: ReadonlySet<number>,
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
  for (const row of Array.from(body.rows)) {
    if (row.getAttribute('aria-hidden') === 'true') {
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
  }
  return undefined;
}

function scrollViewport(node: HTMLDivElement, scrollTop: number) {
  node.scrollTop = scrollTop;
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
  const hasValidConfig =
    config !== undefined &&
    calculateTableWindow({
      rowCount: data.length,
      rowHeight: config.rowHeight,
      viewportHeight: config.viewportHeight,
      scrollTop: 0,
      bodyOffset: 0,
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
  const snapshot = useSyncExternalStore(
    canWindow ? geometry.subscribe : subscribeToNothing,
    canWindow ? geometry.getSnapshot : getEmptyGeometry,
    canWindow ? geometry.getServerSnapshot : getEmptyGeometry,
  );
  const [focusedKey, setFocusedKey] = useState<string | number | undefined>();
  const [tracking, setTracking] = useState<WindowTracking | undefined>();
  const focusNoteRef = useRef<FocusWithin | null>(null);
  useDevWarningPerMessage(
    'Table',
    `${violation?.reason} Rendering all rows without fixed constraints.`,
    isRejected,
  );
  useInteractionModalityTrackingFor(viewport);

  // This is the only full-data pass owned here, and never runs on a scroll snapshot.
  const keyIndices = useMemo(() => {
    const indices = new Map<string | number, number>();
    if (hasValidConfig && isAdmitted) {
      for (let index = 0; index < keys.length; index++) {
        indices.set(keys[index], index);
      }
    }
    return indices;
  }, [keys, hasValidConfig, isAdmitted]);
  const focusIndex =
    focusedKey === undefined ? undefined : keyIndices.get(focusedKey);
  if (focusedKey !== undefined && focusIndex === undefined) {
    setFocusedKey(undefined);
  }
  const last = tracking?.window;
  const hasCurrentMeasurement =
    snapshot.isMeasured &&
    isPositiveFinite(snapshot.viewportHeight) &&
    Number.isFinite(snapshot.scrollTop) &&
    Number.isFinite(snapshot.bodyOffset) &&
    snapshot.bodyOffset >= 0;
  const effectiveGeometry = hasCurrentMeasurement
    ? snapshot
    : last != null && last.config === config
      ? last.geometry
      : {
          viewportHeight: config?.viewportHeight ?? 0,
          scrollTop: 0,
          bodyOffset: 0,
          isMeasured: false,
        };
  const hasChangedInputs =
    last !== undefined &&
    (last.data !== data ||
      last.keys !== keys ||
      last.config.rowHeight !== config?.rowHeight ||
      last.config.viewportHeight !== config?.viewportHeight);
  const anchorScroll =
    canWindow && !isRejected && hasChangedInputs && config && last
      ? reconcileTableAnchor({
          previousKeys: last.keys,
          keys,
          keyIndices,
          firstVisibleIndex: last.plan.firstVisibleIndex,
          offset: (last.plan.offset / last.config.rowHeight) * config.rowHeight,
          rowHeight: config.rowHeight,
          viewportHeight: effectiveGeometry.viewportHeight,
          bodyOffset: effectiveGeometry.bodyOffset,
          trailingContentHeight: Math.max(
            0,
            (last.geometry.scrollHeight ?? 0) -
              last.geometry.bodyOffset -
              last.plan.totalHeight,
          ),
        })
      : undefined;
  const pending = tracking?.pending;
  const isAwaitingAnchor =
    tracking?.source === geometry &&
    pending !== undefined &&
    pending.snapshot.scrollTop === snapshot.scrollTop &&
    (pending.to !== snapshot.scrollTop || pending.snapshot === snapshot);
  const pendingScroll =
    anchorScroll ?? (isAwaitingAnchor ? pending.to : undefined);
  const resolvedScroll = pendingScroll ?? effectiveGeometry.scrollTop;
  const plan =
    canWindow && !isRejected && config
      ? calculateTableWindow({
          rowCount: data.length,
          rowHeight: config.rowHeight,
          viewportHeight: effectiveGeometry.viewportHeight,
          scrollTop: resolvedScroll,
          scrollHeight: effectiveGeometry.scrollHeight,
          bodyOffset: effectiveGeometry.bodyOffset,
          isMeasured: effectiveGeometry.isMeasured,
          focusIndex,
        })
      : null;
  const isWindowed = plan !== null;
  const start = plan?.start ?? 0;
  const end = plan?.end ?? data.length;
  const rowHeight = config?.rowHeight ?? 0;
  // The last window affects rendering, so it lives in state.
  // Immutable inputs limit this update to one extra render.
  if (plan !== null && config !== undefined) {
    if (
      tracking === undefined ||
      tracking.source !== geometry ||
      tracking.snapshot !== snapshot ||
      last?.data !== data ||
      last.keys !== keys ||
      last.config !== config
    ) {
      setTracking({
        source: geometry,
        snapshot,
        window: {
          data,
          keys,
          config,
          geometry: {...effectiveGeometry, scrollTop: resolvedScroll},
          plan,
        },
        pending:
          anchorScroll !== undefined
            ? {snapshot, to: anchorScroll}
            : isAwaitingAnchor
              ? pending
              : undefined,
      });
    }
  } else if (tracking !== undefined) {
    setTracking(undefined);
  }
  // Range snapshots within the same mounted interval retain the exact segment array.
  const segments = useMemo<WindowSegment[]>(() => {
    if (!isWindowed) {
      return data.length === 0
        ? []
        : [{type: 'rows', start: 0, end: data.length}];
    }
    return createTableWindowSegments(
      data.length,
      rowHeight,
      start,
      end,
      focusIndex,
    );
  }, [isWindowed, start, end, data.length, rowHeight, focusIndex]);

  const onRowFocus = useCallback(
    (key: string | number, focusTarget?: HTMLElement) => {
      focusNoteRef.current =
        noteFocusWithin(focusTarget ?? body.current) ?? focusNoteRef.current;
      setFocusedKey(key);
    },
    [body],
  );
  const onRowBlur = useCallback(() => {
    focusNoteRef.current = null;
    setFocusedKey(undefined);
  }, []);

  useIsomorphicLayoutEffect(() => {
    // Restore removed focus and scroll anchoring, then validate mounted geometry.
    if (
      focusNoteRef.current != null &&
      (focusedKey === undefined || focusIndex === undefined)
    ) {
      moveFocusLeftBehind(focusNoteRef.current, viewport.current, null, {
        preventScroll: true,
      });
      focusNoteRef.current = null;
    }
    if (!isWindowed || !config || !plan) {
      return;
    }
    if (
      pendingScroll !== undefined &&
      viewport.current &&
      Math.abs(viewport.current.scrollTop - pendingScroll) > 0.5
    ) {
      scrollViewport(viewport.current, pendingScroll);
    }
    if (body.current && viewport.current && table.current) {
      const reason = getGeometryViolation(
        body.current,
        viewport.current,
        table.current,
        config.rowHeight,
        plan.totalHeight,
        logicalPositionColumns,
      );
      if (reason) {
        // eslint-disable-next-line @eslint-react/set-state-in-effect -- bounded mounted-DOM validation disables invalid fixed geometry in all builds
        setViolation({data, keys, config, reason});
      }
    }
  });

  return useMemo(
    () => ({
      segments,
      isWindowed,
      isFixedHeight: isWindowed,
      onRowFocus,
      onRowBlur,
    }),
    [segments, isWindowed, onRowFocus, onRowBlur],
  );
}
