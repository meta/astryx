// Copyright (c) Meta Platforms, Inc. and affiliates.
'use client';

/**
 * @file Parent-owned Table viewport and window geometry.
 * @input Canonical viewport/body refs, owned wrapper identity and shared scroll invalidations.
 * @output Stable geometry snapshots and private wrapper ownership.
 * @position Private parent runtime; modules never discover another scroll owner.
 */
import {subscribeScrollGeometry} from '../hooks/scrollGeometrySubscriptions';
import {releaseTemporaryFocus} from '../utils/focusReturn';
import {createSharedContext} from '../utils/sharedContext';

const ownedScrollWrappers = new WeakSet<object>();
export function registerTableScrollWrapper(wrapper: object): void {
  ownedScrollWrappers.add(wrapper);
}
export function isTableScrollWrapperOwned(wrapper: object): boolean {
  return ownedScrollWrappers.has(wrapper);
}

export interface TableGeometrySnapshot {
  readonly viewportHeight: number;
  readonly scrollTop: number;
  readonly scrollHeight: number;
  readonly startOffset: number;
  readonly isMeasured: boolean;
  /** Inline viewport size, measured with the block axis. */
  readonly viewportWidth: number;
  /**
   * Logical inline scroll distance from the inline start, also in right-to-left
   * tables. It is read only while an inline subscriber exists, otherwise 0.
   */
  readonly scrollLeft: number;
  /** Increments on each content or layout invalidation; a scroll keeps it. */
  readonly revision: number;
  /** Increments on each size, font, or outer class or style change. */
  readonly layoutRevision: number;
}
const EMPTY_GEOMETRY: TableGeometrySnapshot = {
  viewportHeight: 0,
  scrollTop: 0,
  scrollHeight: 0,
  startOffset: 0,
  isMeasured: false,
  viewportWidth: 0,
  scrollLeft: 0,
  revision: 0,
  layoutRevision: 0,
};

export function createTableRuntime() {
  const viewport = {current: null as HTMLDivElement | null};
  const body = {current: null as HTMLTableSectionElement | null};
  const table = {current: null as HTMLTableElement | null};
  const listeners = new Set<() => void>();
  // Only column windowing reads the inline position. Without it, an inline
  // scroll publishes nothing, so row windowing does no extra work.
  let inlineListenerCount = 0;
  let snapshot = EMPTY_GEOMETRY;
  let stopGeometry: (() => void) | undefined;
  let measuredViewport: HTMLDivElement | null = null;
  function publish(next: TableGeometrySnapshot) {
    snapshot = next;
    for (const listener of listeners) {
      listener();
    }
  }
  function refresh(
    hasContentInvalidation = false,
    hasLayoutInvalidation = false,
  ) {
    if (listeners.size === 0) {
      return;
    }
    const el = viewport.current;
    const section = body.current;
    if (el == null || section == null || !el.isConnected) {
      return;
    }
    // A plain scroll changes only scrollTop. Sizes and the body origin change
    // with the content and layout invalidations the scroll owner reports, so
    // a scroll reads nothing else.
    if (
      !hasContentInvalidation &&
      !hasLayoutInvalidation &&
      snapshot.isMeasured &&
      measuredViewport === el
    ) {
      const scrollTop = el.scrollTop;
      const scrollLeft =
        inlineListenerCount > 0 ? Math.abs(el.scrollLeft) : snapshot.scrollLeft;
      if (
        scrollTop !== snapshot.scrollTop ||
        scrollLeft !== snapshot.scrollLeft
      ) {
        publish({...snapshot, scrollTop, scrollLeft});
      }
      return;
    }
    const viewportHeight = el.clientHeight;
    if (viewportHeight <= 0) {
      return;
    }
    const scrollTop = el.scrollTop;
    const next: TableGeometrySnapshot = {
      viewportHeight,
      scrollTop,
      scrollHeight: el.scrollHeight,
      startOffset:
        section.getBoundingClientRect().top -
        el.getBoundingClientRect().top +
        scrollTop -
        el.clientTop,
      isMeasured: true,
      viewportWidth: el.clientWidth,
      scrollLeft: inlineListenerCount > 0 ? Math.abs(el.scrollLeft) : 0,
      revision:
        snapshot.revision +
        (hasContentInvalidation || hasLayoutInvalidation ? 1 : 0),
      layoutRevision: snapshot.layoutRevision + (hasLayoutInvalidation ? 1 : 0),
    };
    measuredViewport = el;
    if (
      !hasContentInvalidation &&
      !hasLayoutInvalidation &&
      snapshot.viewportHeight === next.viewportHeight &&
      snapshot.scrollTop === next.scrollTop &&
      snapshot.scrollHeight === next.scrollHeight &&
      snapshot.startOffset === next.startOffset &&
      snapshot.viewportWidth === next.viewportWidth &&
      snapshot.scrollLeft === next.scrollLeft &&
      snapshot.isMeasured
    ) {
      return;
    }
    publish(next);
  }
  function connectGeometry() {
    const node = viewport.current;
    if (node == null || listeners.size === 0 || stopGeometry != null) {
      return;
    }
    stopGeometry = subscribeScrollGeometry(node, refresh);
    refresh(true, true);
  }
  function subscribe(fn: () => void) {
    listeners.add(fn);
    connectGeometry();
    return () => {
      listeners.delete(fn);
      if (listeners.size === 0) {
        stopGeometry?.();
        stopGeometry = undefined;
      }
    };
  }
  const geometry = {
    subscribe,
    /** Also publishes inline scrolling, through the same subscription. */
    subscribeInline(fn: () => void) {
      inlineListenerCount++;
      const unsubscribe = subscribe(fn);
      // An existing measurement has no inline position yet.
      refresh();
      return () => {
        inlineListenerCount--;
        unsubscribe();
      };
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => EMPTY_GEOMETRY,
  };
  function setViewport(node: HTMLDivElement | null) {
    if (viewport.current === node) {
      return;
    }
    const previous = viewport.current;
    stopGeometry?.();
    stopGeometry = undefined;
    viewport.current = node;
    if (previous != null) {
      // Ref cleanup can precede removal or a same-commit successor ref.
      queueMicrotask(() => {
        if (!previous.isConnected) {
          releaseTemporaryFocus(previous);
        }
      });
    }
    if (node == null) {
      // Ref composition can detach/reattach the same live node within one commit.
      // Retain its last measurement so ref churn cannot create a reset/re-render loop.
      return;
    }
    connectGeometry();
    return () => {
      if (viewport.current === node) {
        setViewport(null);
      }
    };
  }
  function setBody(node: HTMLTableSectionElement | null) {
    body.current = node;
    refresh(true, true);
  }
  function setTable(node: HTMLTableElement | null) {
    table.current = node;
    refresh(true, true);
  }
  return {
    viewport,
    body,
    table,
    geometry,
    setViewport,
    setBody,
    setTable,
    refresh,
  };
}
export type TableRuntime = ReturnType<typeof createTableRuntime>;
export const TableRuntimeContext = createSharedContext<
  (TableRuntime & {viewportHeight?: number; isLoadingAdmitted?: boolean}) | null
>('TableRuntimeContext', 1, null);
