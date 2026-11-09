// Copyright (c) Meta Platforms, Inc. and affiliates.
'use client';

/**
 * @file Parent-owned Table viewport and element refs.
 * @input Canonical viewport/body/table refs, owned wrapper identity and an
 *   optional geometry driver
 * @output The runtime refs, geometry snapshots when a driver measures them,
 *   and private wrapper ownership
 * @position Private parent runtime; modules never discover another scroll
 *   owner. Only a windowed Table passes a geometry driver.
 */
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
  /** Increments on each content or layout invalidation; a scroll keeps it. */
  readonly revision: number;
  /** Increments on each size, font, or outer class or style change. */
  readonly layoutRevision: number;
}
export const EMPTY_TABLE_GEOMETRY: TableGeometrySnapshot = {
  viewportHeight: 0,
  scrollTop: 0,
  scrollHeight: 0,
  startOffset: 0,
  isMeasured: false,
  revision: 0,
  layoutRevision: 0,
};

/** The runtime's element refs, read by an optional geometry driver. */
export interface TableRuntimeRefs {
  readonly viewport: {current: HTMLDivElement | null};
  readonly body: {current: HTMLTableSectionElement | null};
  readonly table: {current: HTMLTableElement | null};
}
export interface TableGeometrySource {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => TableGeometrySnapshot;
  getServerSnapshot: () => TableGeometrySnapshot;
}
/** Measures the viewport for the list window; only a windowed Table has one. */
export interface TableGeometryDriver {
  readonly geometry: TableGeometrySource;
  refresh: (
    hasContentInvalidation?: boolean,
    hasLayoutInvalidation?: boolean,
  ) => void;
  connect: () => void;
  disconnect: () => void;
}
const INERT_GEOMETRY: TableGeometrySource = {
  subscribe: () => () => {},
  getSnapshot: () => EMPTY_TABLE_GEOMETRY,
  getServerSnapshot: () => EMPTY_TABLE_GEOMETRY,
};

export function createTableRuntime(
  createDriver?: (refs: TableRuntimeRefs) => TableGeometryDriver,
) {
  const viewport = {current: null as HTMLDivElement | null};
  const body = {current: null as HTMLTableSectionElement | null};
  const table = {current: null as HTMLTableElement | null};
  const driver = createDriver?.({viewport, body, table});
  const refresh = (
    hasContentInvalidation?: boolean,
    hasLayoutInvalidation?: boolean,
  ) => driver?.refresh(hasContentInvalidation, hasLayoutInvalidation);
  function setViewport(node: HTMLDivElement | null) {
    if (viewport.current === node) {
      return;
    }
    const previous = viewport.current;
    driver?.disconnect();
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
    driver?.connect();
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
    geometry: driver?.geometry ?? INERT_GEOMETRY,
    setViewport,
    setBody,
    setTable,
    refresh,
  };
}
export type TableRuntime = ReturnType<typeof createTableRuntime>;
export const TableRuntimeContext = createSharedContext<
  (TableRuntime & {viewportHeight?: number}) | null
>('TableRuntimeContext', 1, null);
