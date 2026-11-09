// Copyright (c) Meta Platforms, Inc. and affiliates.
'use client';

/**
 * @file tableGeometry.ts
 * @input The Table runtime's viewport, body and table refs and the shared
 *   scroll invalidations
 * @output Stable geometry snapshots for the list window
 * @position The windowed Table's geometry driver. Only the virtualization
 *   plugin creates it, so a Table that does not window installs no observer.
 */
import {subscribeScrollGeometry} from '../../../hooks/scrollGeometrySubscriptions';
import {
  EMPTY_TABLE_GEOMETRY,
  type TableGeometryDriver,
  type TableGeometrySnapshot,
  type TableRuntimeRefs,
} from '../../tableRuntime';

export function createTableGeometryDriver({
  viewport,
  body,
}: TableRuntimeRefs): TableGeometryDriver {
  const listeners = new Set<() => void>();
  let snapshot = EMPTY_TABLE_GEOMETRY;
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
      if (scrollTop !== snapshot.scrollTop) {
        publish({...snapshot, scrollTop});
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
  const geometry = {
    subscribe(fn: () => void) {
      listeners.add(fn);
      connectGeometry();
      return () => {
        listeners.delete(fn);
        if (listeners.size === 0) {
          stopGeometry?.();
          stopGeometry = undefined;
        }
      };
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => EMPTY_TABLE_GEOMETRY,
  };
  return {
    geometry,
    refresh,
    connect: connectGeometry,
    disconnect() {
      stopGeometry?.();
      stopGeometry = undefined;
    },
  };
}
