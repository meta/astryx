// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useListWindow.ts
 * @input Canonical item keys, a fixed pitch, a shared geometry source and the
 *   consumer's viewport and focus container refs
 * @output A React-tracked row and gap plan, its segments, one retained focus
 *   island, and first-visible-key anchoring across data and pitch changes
 * @position The block-axis long-list windowing hook of the private module. A
 *   consumer decides admission and owns its DOM and diagnostics; this hook
 *   owns the window and the anchor, and the shared focus island
 *   (`useListFocusIsland`) keeps the focused row. It installs no observer.
 */
import {useMemo, useState, useSyncExternalStore, type RefObject} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {useListFocusIsland, type ListWindowKey} from './useListFocusIsland';
import {
  calculateListWindow,
  createListWindowSegments,
  isPositiveFinite,
  reconcileListAnchor,
  type ListWindowPlan,
  type ListWindowSegment,
} from './listWindow';

export type {ListWindowKey} from './useListFocusIsland';

/** The fixed row pitch and the viewport height to plan with before measuring. */
export interface ListWindowPitch {
  readonly rowHeight: number;
  readonly viewportHeight: number;
}

export interface ListWindowGeometry {
  /** Actual unobscured viewport height; sticky occlusion is accounted for once by the consumer. */
  viewportHeight: number;
  scrollTop: number;
  /** Native scroll content extent, including chrome after the list when measured. */
  scrollHeight?: number;
  /** Distance from the scroll origin to the first row, in the scrollTop space. */
  startOffset: number;
  isMeasured: boolean;
  /** Increments on each content or layout invalidation; a scroll keeps it. */
  revision?: number;
  /** Increments on each size, font, or outer class or style change. */
  layoutRevision?: number;
}

export interface ListWindowGeometrySource {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => ListWindowGeometry;
  getServerSnapshot: () => ListWindowGeometry;
}

export interface UseListWindowOptions {
  /**
   * The consumer's item list. Only its identity is read: a new list re-anchors
   * on the first visible key.
   */
  items: unknown;
  /** One canonical key per item, in order. */
  keys: ReadonlyArray<ListWindowKey>;
  /** The number of items; it equals the key count whenever the list windows. */
  rowCount: number;
  /** Undefined when the consumer has no valid pitch. */
  pitch: ListWindowPitch | undefined;
  /** Whether the consumer indexes its keys: a valid pitch and an admitted list. */
  isEligible: boolean;
  /** Whether the consumer windows now; eligible and not rejected. */
  canWindow: boolean;
  geometry: ListWindowGeometrySource;
  /** The scroll viewport; it takes focus when the focused item unmounts. */
  viewport: RefObject<HTMLElement | null>;
  /** Where item focus is noted when an item reports no focus target. */
  focusContainer: RefObject<HTMLElement | null>;
}

export interface ListWindowResult {
  segments: ListWindowSegment[];
  plan: ListWindowPlan | null;
  isWindowed: boolean;
  snapshot: ListWindowGeometry;
  onItemFocus: (key: ListWindowKey, focusTarget?: HTMLElement) => void;
  /** The consumer invokes this only when focus genuinely leaves the item. */
  onItemBlur: () => void;
}

interface RenderedWindow {
  items: unknown;
  keys: ReadonlyArray<ListWindowKey>;
  pitch: ListWindowPitch;
  geometry: ListWindowGeometry;
  plan: ListWindowPlan;
}
interface PendingAnchor {
  snapshot: ListWindowGeometry;
  to: number;
}
interface WindowTracking {
  source: ListWindowGeometrySource;
  snapshot: ListWindowGeometry;
  window: RenderedWindow;
  pending: PendingAnchor | undefined;
}

const EMPTY_GEOMETRY: ListWindowGeometry = Object.freeze({
  viewportHeight: 0,
  scrollTop: 0,
  startOffset: 0,
  isMeasured: false,
});
const getEmptyGeometry = () => EMPTY_GEOMETRY;

/** The largest block-axis band past each viewport edge, in CSS pixels. */
const BLOCK_BAND_LIMIT = 512;

/** The distance mounted past each viewport edge for a measured viewport. */
export function getBlockBandPadding(viewportHeight: number): number {
  return Math.max(0, Math.min(BLOCK_BAND_LIMIT, viewportHeight));
}

/**
 * A snapshot reader that keeps the last snapshot it planned from until the
 * block scroll offset moves half a band, or the viewport size, start offset,
 * extent, measured state or layout revision changes. An identical snapshot
 * lets React skip the render, so a scroll inside the band commits nothing,
 * and an inline-only scroll never reaches the row plan. A content revision
 * alone passes nothing through: the window's own mounts publish one, and it
 * changes no plan input.
 */
function createBandedBlockSnapshot(
  source: ListWindowGeometrySource,
  isPassThrough: boolean,
): () => ListWindowGeometry {
  let planned: ListWindowGeometry | undefined;
  return () => {
    const live = source.getSnapshot();
    if (
      isPassThrough ||
      planned === undefined ||
      !live.isMeasured ||
      !planned.isMeasured ||
      live.viewportHeight !== planned.viewportHeight ||
      live.startOffset !== planned.startOffset ||
      live.scrollHeight !== planned.scrollHeight ||
      live.layoutRevision !== planned.layoutRevision ||
      Math.abs(live.scrollTop - planned.scrollTop) >=
        getBlockBandPadding(live.viewportHeight) / 2
    ) {
      planned = live;
    }
    return planned;
  };
}
const subscribeToNothing = () => () => {};

function scrollViewport(node: HTMLElement, scrollTop: number) {
  node.scrollTop = scrollTop;
}

export function useListWindow({
  items,
  keys,
  rowCount,
  pitch,
  isEligible,
  canWindow,
  geometry,
  viewport,
  focusContainer,
}: UseListWindowOptions): ListWindowResult {
  const [tracking, setTracking] = useState<WindowTracking | undefined>();
  // A pending anchor write must see each live offset until it lands.
  const isAnchorPending = tracking?.pending !== undefined;
  const getBandedSnapshot = useMemo(
    () => createBandedBlockSnapshot(geometry, isAnchorPending),
    [geometry, isAnchorPending],
  );
  const snapshot = useSyncExternalStore(
    canWindow ? geometry.subscribe : subscribeToNothing,
    canWindow ? getBandedSnapshot : getEmptyGeometry,
    canWindow ? geometry.getServerSnapshot : getEmptyGeometry,
  );

  // This is the only full-data pass owned here, and never runs on a scroll snapshot.
  const keyIndices = useMemo(() => {
    const indices = new Map<ListWindowKey, number>();
    if (isEligible) {
      for (let index = 0; index < keys.length; index++) {
        indices.set(keys[index], index);
      }
    }
    return indices;
  }, [keys, isEligible]);
  const {focusIndex, onItemFocus, onItemBlur} = useListFocusIsland({
    keyIndices,
    isActive: canWindow,
    viewport,
    focusContainer,
  });
  const last = tracking?.window;
  const hasCurrentMeasurement =
    snapshot.isMeasured &&
    isPositiveFinite(snapshot.viewportHeight) &&
    Number.isFinite(snapshot.scrollTop) &&
    Number.isFinite(snapshot.startOffset) &&
    snapshot.startOffset >= 0;
  const effectiveGeometry = hasCurrentMeasurement
    ? snapshot
    : last != null && last.pitch === pitch
      ? last.geometry
      : {
          viewportHeight: pitch?.viewportHeight ?? 0,
          scrollTop: 0,
          startOffset: 0,
          isMeasured: false,
        };
  const hasChangedInputs =
    last !== undefined &&
    (last.items !== items ||
      last.keys !== keys ||
      last.pitch.rowHeight !== pitch?.rowHeight ||
      last.pitch.viewportHeight !== pitch?.viewportHeight);
  const anchorScroll =
    canWindow && hasChangedInputs && pitch && last
      ? reconcileListAnchor({
          previousKeys: last.keys,
          keys,
          keyIndices,
          firstVisibleIndex: last.plan.firstVisibleIndex,
          // A negative offset is a distance inside the leading content, not a
          // fraction of a row, so a new pitch does not scale it.
          offset:
            last.plan.offset < 0
              ? last.plan.offset
              : (last.plan.offset / last.pitch.rowHeight) * pitch.rowHeight,
          rowHeight: pitch.rowHeight,
          viewportHeight: effectiveGeometry.viewportHeight,
          startOffset: effectiveGeometry.startOffset,
          trailingContentHeight: Math.max(
            0,
            (last.geometry.scrollHeight ?? 0) -
              last.geometry.startOffset -
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
    canWindow && pitch
      ? calculateListWindow({
          rowCount,
          rowHeight: pitch.rowHeight,
          viewportHeight: effectiveGeometry.viewportHeight,
          scrollTop: resolvedScroll,
          scrollHeight: effectiveGeometry.scrollHeight,
          startOffset: effectiveGeometry.startOffset,
          isMeasured: effectiveGeometry.isMeasured,
          focusIndex,
          bandPadding: getBlockBandPadding(effectiveGeometry.viewportHeight),
        })
      : null;
  const isWindowed = plan !== null;
  const start = plan?.start ?? 0;
  const end = plan?.end ?? rowCount;
  const rowHeight = pitch?.rowHeight ?? 0;
  // The last window affects rendering, so it lives in state.
  // Immutable inputs limit this update to one extra render.
  if (plan !== null && pitch !== undefined) {
    if (
      tracking === undefined ||
      tracking.source !== geometry ||
      tracking.snapshot !== snapshot ||
      last === undefined ||
      last.items !== items ||
      last.keys !== keys ||
      last.pitch !== pitch
    ) {
      setTracking({
        source: geometry,
        snapshot,
        window: {
          items,
          keys,
          pitch,
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
  const segments = useMemo<ListWindowSegment[]>(() => {
    if (!isWindowed) {
      return rowCount === 0 ? [] : [{type: 'rows', start: 0, end: rowCount}];
    }
    return createListWindowSegments(
      rowCount,
      rowHeight,
      start,
      end,
      focusIndex,
    );
  }, [isWindowed, start, end, rowCount, rowHeight, focusIndex]);

  useIsomorphicLayoutEffect(() => {
    // Syncs the viewport scroll position with the committed rows.
    if (!isWindowed || !pitch || !plan) {
      return;
    }
    if (
      pendingScroll !== undefined &&
      viewport.current &&
      Math.abs(viewport.current.scrollTop - pendingScroll) > 0.5
    ) {
      scrollViewport(viewport.current, pendingScroll);
    }
  });

  return {segments, plan, isWindowed, snapshot, onItemFocus, onItemBlur};
}
