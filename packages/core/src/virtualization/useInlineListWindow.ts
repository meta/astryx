// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useInlineListWindow.ts
 * @input Item start offsets of varying size, the viewport space covered at
 *   each inline edge, a first-frame viewport width and a shared inline
 *   geometry source
 * @output The mounted item range, with overscan, and its segments
 * @position The inline-axis hook of the private list-windowing module, beside
 *   `useListWindow`. A consumer decides admission and owns its DOM; this hook
 *   owns the window. It installs no observer and adds no subscription of its
 *   own: it reads the consumer's shared geometry source.
 */
import {useMemo, useSyncExternalStore} from 'react';
import {
  calculateVariableListRange,
  createListWindowSegments,
  isPositiveFinite,
  type ListWindowSegment,
} from './listWindow';

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
}

export interface InlineListWindowResult {
  /** True while at least one item is not mounted. */
  isWindowed: boolean;
  /**
   * Mounted items and the gaps between them, in item order. A gap's `height`
   * is the extent of its items along the inline axis.
   */
  segments: ListWindowSegment[];
}

const UNMEASURED: InlineListWindowGeometry = Object.freeze({isMeasured: false});
const getUnmeasured = () => UNMEASURED;
const subscribeToNothing = () => () => {};

export function useInlineListWindow({
  offsets,
  insetStart,
  insetEnd,
  initialViewportWidth,
  overscan,
  canWindow,
  geometry,
}: UseInlineListWindowOptions): InlineListWindowResult {
  const snapshot = useSyncExternalStore(
    canWindow ? geometry.subscribeInline : subscribeToNothing,
    canWindow ? geometry.getSnapshot : getUnmeasured,
    canWindow ? geometry.getServerSnapshot : getUnmeasured,
  );
  const count = Math.max(0, offsets.length - 1);
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
  const range = canWindow
    ? calculateVariableListRange({
        offsets,
        viewportSize,
        scrollOffset: isMeasured ? (snapshot.scrollLeft ?? 0) : 0,
        isMeasured,
        overscan,
      })
    : undefined;
  const isWindowed =
    range !== undefined && (range.start > 0 || range.end < count);
  const start = isWindowed ? range.start : 0;
  const end = isWindowed ? range.end : count;

  // A scroll inside the mounted range keeps the exact segment array.
  const segments = useMemo<ListWindowSegment[]>(
    () =>
      createListWindowSegments(count, 1, start, end).map(segment =>
        segment.type === 'gap'
          ? {...segment, height: offsets[segment.end] - offsets[segment.start]}
          : segment,
      ),
    [count, start, end, offsets],
  );
  return useMemo(() => ({isWindowed, segments}), [isWindowed, segments]);
}
