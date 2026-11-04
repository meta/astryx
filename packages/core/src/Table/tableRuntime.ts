// Copyright (c) Meta Platforms, Inc. and affiliates.
'use client';

/**
 * @file Parent-owned Table viewport and window geometry.
 * @input Canonical viewport/body refs, owned wrapper identity and shared scroll invalidations.
 * @output Stable geometry snapshots and private wrapper ownership.
 * @position Private parent runtime; modules never discover another scroll owner.
 */
import {createContext} from 'react';
import {subscribeScrollGeometry} from '../hooks/scrollGeometrySubscriptions';
import {releaseTemporaryFocus} from '../utils/focusReturn';

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
  readonly bodyOffset: number;
  readonly isMeasured: boolean;
  readonly revision: number;
}
const EMPTY_GEOMETRY: TableGeometrySnapshot = {
  viewportHeight: 0,
  scrollTop: 0,
  scrollHeight: 0,
  bodyOffset: 0,
  isMeasured: false,
  revision: 0,
};

export function createTableRuntime() {
  const viewport = {current: null as HTMLDivElement | null};
  const body = {current: null as HTMLTableSectionElement | null};
  const table = {current: null as HTMLTableElement | null};
  const listeners = new Set<() => void>();
  let snapshot = EMPTY_GEOMETRY;
  let stopGeometry: (() => void) | undefined;
  function refresh(hasContentInvalidation = false) {
    if (listeners.size === 0) {
      return;
    }
    const el = viewport.current;
    const section = body.current;
    if (
      el == null ||
      section == null ||
      !el.isConnected ||
      el.clientHeight <= 0
    ) {
      return;
    }
    const offset =
      section.getBoundingClientRect().top -
      el.getBoundingClientRect().top +
      el.scrollTop -
      el.clientTop;
    const next = {
      viewportHeight: el.clientHeight,
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      bodyOffset: offset,
      isMeasured: true,
      revision: snapshot.revision + (hasContentInvalidation ? 1 : 0),
    };
    if (
      !hasContentInvalidation &&
      snapshot.viewportHeight === next.viewportHeight &&
      snapshot.scrollTop === next.scrollTop &&
      snapshot.scrollHeight === next.scrollHeight &&
      snapshot.bodyOffset === next.bodyOffset &&
      snapshot.isMeasured
    ) {
      return;
    }
    snapshot = next;
    for (const listener of listeners) {
      listener();
    }
  }
  function connectGeometry() {
    const node = viewport.current;
    if (node == null || listeners.size === 0 || stopGeometry != null) {
      return;
    }
    stopGeometry = subscribeScrollGeometry(node, refresh);
    refresh();
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
    refresh();
  }
  function setTable(node: HTMLTableElement | null) {
    table.current = node;
    refresh();
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
export const TableRuntimeContext = createContext<
  (TableRuntime & {viewportHeight?: number}) | null
>(null);
TableRuntimeContext.displayName = 'TableRuntimeContext';
