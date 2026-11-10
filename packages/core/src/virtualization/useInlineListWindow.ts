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
interface InlineTracking {
  source: InlineListWindowGeometrySource;
  snapshot: InlineListWindowGeometry;
  keys: ReadonlyArray<ListWindowKey>;
  offsets: ReadonlyArray<number>;
  firstVisibleIndex: number;
  /** The scrolled part of the first visible item, as a fraction of it. */
  fraction: number;
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
  const snapshot = useSyncExternalStore(
    canWindow ? geometry.subscribeInline : subscribeToNothing,
    canWindow ? geometry.getSnapshot : getUnmeasured,
    canWindow ? geometry.getServerSnapshot : getUnmeasured,
  );
  const [tracking, setTracking] = useState<InlineTracking | undefined>();
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

  const isMeasured =
    snapshot.isMeasured &&
    isPositiveFinite(snapshot.viewportWidth ?? 0) &&
    Number.isFinite(snapshot.scrollLeft ?? 0);
  // The insets cover the viewport's edges, so only the space between them
  // shows items. The first frame plans for the same space.
  const viewportSize =
    (isMeasured ? (snapshot.viewportWidth ?? 0) : initialViewportWidth) -
    insetStart -
    insetEnd;
  // Item order, sizes and the insets keep the first visible item's key and
  // its fractional offset.
  const last = tracking;
  const anchorScroll =
    canWindow &&
    isMeasured &&
    last !== undefined &&
    (last.keys !== keys || last.offsets !== offsets)
      ? reconcileListAnchor({
          previousKeys: last.keys,
          keys,
          keyIndices,
          firstVisibleIndex: last.firstVisibleIndex,
          offset: last.fraction,
          offsets,
          rowHeight: 0,
          viewportHeight: viewportSize,
          startOffset: 0,
        })
      : undefined;
  const pending = tracking?.pending;
  const isAwaitingAnchor =
    tracking?.source === geometry &&
    pending !== undefined &&
    pending.snapshot.scrollLeft === snapshot.scrollLeft &&
    (pending.to !== snapshot.scrollLeft || pending.snapshot === snapshot);
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
  // The last window feeds the anchor, so it lives in state. Immutable inputs
  // limit this update to one extra render.
  if (range !== undefined && isMeasured) {
    if (
      tracking === undefined ||
      tracking.source !== geometry ||
      tracking.snapshot !== snapshot ||
      tracking.keys !== keys ||
      tracking.offsets !== offsets
    ) {
      const firstSize =
        offsets[range.firstVisibleIndex + 1] - offsets[range.firstVisibleIndex];
      setTracking({
        source: geometry,
        snapshot,
        keys,
        offsets,
        firstVisibleIndex: range.firstVisibleIndex,
        fraction: firstSize > 0 ? range.offset / firstSize : 0,
        pending:
          anchorScroll !== undefined
            ? {snapshot, to: anchorScroll}
            : isAwaitingAnchor
              ? pending
              : undefined,
      });
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
