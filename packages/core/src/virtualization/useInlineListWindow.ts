// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useInlineListWindow.ts
 * @input Item keys and start offsets of varying size, the viewport space
 *   covered at each inline edge, a first-frame viewport width, a shared
 *   inline geometry source and the consumer's viewport and focus refs
 * @output The mounted item range with overscan, its segments with one
 *   retained focused item, and first-visible-key anchoring across item changes
 * @position The inline-axis hook of the private list-windowing module, beside
 *   `useListWindow`; both share the focus island (`useListFocusIsland`). A
 *   consumer decides admission and owns its DOM. This hook installs no
 *   observer and adds no subscription of its own.
 */
import {useMemo, useState, useSyncExternalStore, type RefObject} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {
  calculateVariableListRange,
  createListWindowSegments,
  isPositiveFinite,
  reconcileListAnchor,
  type ListWindowSegment,
} from './listWindow';
import {useListFocusIsland, type ListWindowKey} from './useListFocusIsland';

export interface InlineListWindowGeometry {
  isMeasured: boolean;
  /** The viewport's inline size. */
  viewportWidth?: number;
  /** The logical inline scroll distance from the inline start. */
  scrollLeft?: number;
}

export interface InlineListWindowGeometrySource {
  /** Subscribes to inline changes through the consumer's one shared subscription. */
  subscribeInline: (onChange: () => void) => () => void;
  getSnapshot: () => InlineListWindowGeometry;
  getServerSnapshot: () => InlineListWindowGeometry;
}

export interface UseInlineListWindowOptions {
  /** One canonical key per item, in order; focus and the anchor follow keys. */
  keys: ReadonlyArray<ListWindowKey>;
  /** The start of each item, then the total extent: one more entry than items. */
  offsets: ReadonlyArray<number>;
  /** Viewport space at the inline start that covers the items, such as pinned content. */
  insetStart: number;
  /** Viewport space at the inline end that covers the items. */
  insetEnd: number;
  /** The viewport width to plan with before measuring. */
  initialViewportWidth: number;
  /** Items mounted past each edge of the visible range. */
  overscan: number;
  /** Whether the consumer windows now. */
  canWindow: boolean;
  geometry: InlineListWindowGeometrySource;
  /** The scroll viewport; it takes focus when the focused item unmounts. */
  viewport: RefObject<HTMLElement | null>;
  /** Where item focus is noted when an item reports no focus target. */
  focusContainer: RefObject<HTMLElement | null>;
}

export interface InlineListWindowResult {
  /** True while at least one item is not mounted. */
  isWindowed: boolean;
  /**
   * Mounted items and the gaps between them, in item order, with at most
   * three gaps around the range and the focused item. A gap's `height` is
   * the extent of its items along the inline axis.
   */
  segments: ListWindowSegment[];
  onItemFocus: (key: ListWindowKey, focusTarget?: HTMLElement) => void;
  /** The consumer invokes this only when focus genuinely leaves the item. */
  onItemBlur: () => void;
}

interface InlinePending {
  snapshot: InlineListWindowGeometry;
  to: number;
}
// The items the window last planned for, and an anchor scroll still to land.
// A scroll changes none of it, so a scroll sets no state.
interface InlineTracking {
  source: InlineListWindowGeometrySource;
  keys: ReadonlyArray<ListWindowKey>;
  offsets: ReadonlyArray<number>;
  pending: InlinePending | undefined;
}

const UNMEASURED: InlineListWindowGeometry = Object.freeze({isMeasured: false});
const getUnmeasured = () => UNMEASURED;
const subscribeToNothing = () => () => {};

/** Right-to-left viewports report a negative physical inline offset. */
function writeInlineScroll(viewport: HTMLElement, logical: number): void {
  const isReversed =
    viewport.ownerDocument.defaultView?.getComputedStyle(viewport).direction ===
    'rtl';
  viewport.scrollLeft = isReversed ? -logical : logical;
}

interface InlineRangeInputs {
  offsets: ReadonlyArray<number>;
  insetStart: number;
  insetEnd: number;
  initialViewportWidth: number;
  overscan: number;
}

/** Whether a geometry snapshot gives a usable inline measurement. */
function isInlineMeasured(snapshot: InlineListWindowGeometry): boolean {
  return (
    snapshot.isMeasured &&
    isPositiveFinite(snapshot.viewportWidth ?? 0) &&
    Number.isFinite(snapshot.scrollLeft ?? 0)
  );
}

/** The space between the insets that shows items, for a snapshot. */
function getInlineViewportSize(
  snapshot: InlineListWindowGeometry,
  {insetStart, insetEnd, initialViewportWidth}: InlineRangeInputs,
): number {
  return (
    (isInlineMeasured(snapshot)
      ? (snapshot.viewportWidth ?? 0)
      : initialViewportWidth) -
    insetStart -
    insetEnd
  );
}

/**
 * Reads the geometry as the window uses it. While no anchor scroll is
 * pending, a snapshot whose mounted range and viewport match the last one
 * returns the last one, so a scroll that keeps the range renders nothing.
 */
function createRangeSelector(
  read: () => InlineListWindowGeometry,
  inputs: InlineRangeInputs,
): () => InlineListWindowGeometry {
  let last: InlineListWindowGeometry | undefined;
  let lastKey = '';
  return () => {
    const snapshot = read();
    if (last === snapshot) {
      return snapshot;
    }
    const isMeasured = isInlineMeasured(snapshot);
    const range = calculateVariableListRange({
      offsets: inputs.offsets,
      viewportSize: getInlineViewportSize(snapshot, inputs),
      scrollOffset: isMeasured ? (snapshot.scrollLeft ?? 0) : 0,
      isMeasured,
      overscan: inputs.overscan,
    });
    const key = `${isMeasured}:${snapshot.viewportWidth}:${range.start}:${range.end}`;
    if (last === undefined || key !== lastKey) {
      last = snapshot;
      lastKey = key;
    }
    return last;
  };
}

function hasSameValues<T>(a: ReadonlyArray<T>, b: ReadonlyArray<T>): boolean {
  return (
    a === b ||
    (a.length === b.length && a.every((value, index) => value === b[index]))
  );
}

export function useInlineListWindow({
  keys,
  offsets,
  insetStart,
  insetEnd,
  initialViewportWidth,
  overscan,
  canWindow,
  geometry,
  viewport,
  focusContainer,
}: UseInlineListWindowOptions): InlineListWindowResult {
  const [tracking, setTracking] = useState<InlineTracking | undefined>();
  const pending = tracking?.pending;
  // A new selector for new items or a pending anchor reads the snapshot
  // fresh. While an anchor scroll is pending, the window reads every
  // snapshot, so it sees the scroll land.
  const getSnapshot = useMemo(
    () =>
      !canWindow
        ? getUnmeasured
        : pending !== undefined
          ? geometry.getSnapshot
          : createRangeSelector(geometry.getSnapshot, {
              offsets,
              insetStart,
              insetEnd,
              initialViewportWidth,
              overscan,
            }),
    [
      canWindow,
      pending,
      geometry,
      offsets,
      insetStart,
      insetEnd,
      initialViewportWidth,
      overscan,
    ],
  );
  const snapshot = useSyncExternalStore(
    canWindow ? geometry.subscribeInline : subscribeToNothing,
    getSnapshot,
    canWindow ? geometry.getServerSnapshot : getUnmeasured,
  );
  const count = Math.max(0, offsets.length - 1);
  // Key work runs when the items change, never on a scroll.
  const keyIndices = useMemo(
    () => new Map(keys.map((key, index) => [key, index])),
    [keys],
  );
  const {focusIndex, onItemFocus, onItemBlur} = useListFocusIsland({
    keyIndices,
    isActive: canWindow,
    viewport,
    focusContainer,
  });

  const isMeasured = isInlineMeasured(snapshot);
  // The insets cover the viewport's edges, so only the space between them
  // shows items. The first frame plans for the same space.
  const viewportSize = getInlineViewportSize(snapshot, {
    offsets,
    insetStart,
    insetEnd,
    initialViewportWidth,
    overscan,
  });
  // A change of item keys or sizes keeps the first visible item's key and
  // its fractional offset. New arrays with the same values are no change,
  // so a caller that rebuilds its items on each render gets no scroll write.
  const last = tracking;
  const hasItemChange =
    last !== undefined &&
    (!hasSameValues(last.keys, keys) || !hasSameValues(last.offsets, offsets));
  const isAwaitingAnchor =
    tracking?.source === geometry &&
    pending !== undefined &&
    pending.snapshot.scrollLeft === snapshot.scrollLeft &&
    (pending.to !== snapshot.scrollLeft || pending.snapshot === snapshot);
  // The first visible item before the change, read from the previous items
  // at the scroll position the window shows.
  const previousRange =
    canWindow && isMeasured && last !== undefined && hasItemChange
      ? calculateVariableListRange({
          offsets: last.offsets,
          viewportSize,
          scrollOffset: isAwaitingAnchor
            ? pending.to
            : (snapshot.scrollLeft ?? 0),
          isMeasured,
          overscan,
        })
      : undefined;
  let anchorScroll: number | undefined;
  if (previousRange !== undefined && last !== undefined) {
    const firstSize =
      last.offsets[previousRange.firstVisibleIndex + 1] -
      last.offsets[previousRange.firstVisibleIndex];
    anchorScroll = reconcileListAnchor({
      previousKeys: last.keys,
      keys,
      keyIndices,
      firstVisibleIndex: previousRange.firstVisibleIndex,
      offset: firstSize > 0 ? previousRange.offset / firstSize : 0,
      offsets,
      rowHeight: 0,
      viewportHeight: viewportSize,
      startOffset: 0,
    });
  }
  const pendingScroll =
    anchorScroll ?? (isAwaitingAnchor ? pending.to : undefined);
  const range = canWindow
    ? calculateVariableListRange({
        offsets,
        viewportSize,
        scrollOffset: isMeasured
          ? (pendingScroll ?? snapshot.scrollLeft ?? 0)
          : 0,
        isMeasured,
        overscan,
      })
    : undefined;
  // The planned items feed the anchor, so they live in state. Only a change
  // of items, of source or of the pending anchor updates it: a scroll does
  // not, so a scroll renders the window once.
  if (range !== undefined && isMeasured) {
    const nextPending =
      anchorScroll !== undefined
        ? {snapshot, to: anchorScroll}
        : isAwaitingAnchor
          ? pending
          : undefined;
    if (
      tracking === undefined ||
      tracking.source !== geometry ||
      hasItemChange ||
      tracking.pending !== nextPending
    ) {
      setTracking({source: geometry, keys, offsets, pending: nextPending});
    }
  } else if (tracking !== undefined && !canWindow) {
    setTracking(undefined);
  }
  const isWindowed =
    range !== undefined && (range.start > 0 || range.end < count);
  const start = isWindowed ? range.start : 0;
  const end = isWindowed ? range.end : count;

  // A scroll inside the mounted range keeps the exact segment array.
  const segments = useMemo<ListWindowSegment[]>(
    () =>
      createListWindowSegments(
        count,
        1,
        start,
        end,
        isWindowed ? focusIndex : undefined,
      ).map(segment =>
        segment.type === 'gap'
          ? {...segment, height: offsets[segment.end] - offsets[segment.start]}
          : segment,
      ),
    [count, start, end, isWindowed, focusIndex, offsets],
  );

  useIsomorphicLayoutEffect(() => {
    // Syncs the inline scroll position with the committed items.
    const node = viewport.current;
    if (
      pendingScroll !== undefined &&
      node != null &&
      Math.abs(Math.abs(node.scrollLeft) - pendingScroll) > 0.5
    ) {
      writeInlineScroll(node, pendingScroll);
    }
  });

  return useMemo(
    () => ({isWindowed, segments, onItemFocus, onItemBlur}),
    [isWindowed, segments, onItemFocus, onItemBlur],
  );
}
