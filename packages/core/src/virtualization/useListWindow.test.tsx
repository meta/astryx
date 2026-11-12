// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useListWindow.test.tsx
 * @input The shared list-windowing hook with a scripted geometry source
 * @output Window, anchor and focus-island assertions that hold for any
 *   consumer, not only Table
 * @position Colocated tests for the private list-windowing hook
 */
import {describe, expect, it} from 'vitest';
import {act, renderHook} from '@testing-library/react';
import {
  useListWindow,
  type ListWindowGeometry,
  type ListWindowGeometrySource,
  type ListWindowPitch,
} from './useListWindow';

function createGeometry(initial: ListWindowGeometry) {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  const source: ListWindowGeometrySource = {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initial,
  };
  return {
    source,
    publish(next: Partial<ListWindowGeometry>) {
      snapshot = {...snapshot, ...next};
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

const PITCH: ListWindowPitch = Object.freeze({
  rowHeight: 20,
  viewportHeight: 200,
});

function keysOf(count: number, from = 0): number[] {
  return Array.from({length: count}, (_, index) => from + index);
}

function renderList(keys: number[], geometry: ListWindowGeometrySource) {
  const viewport = {current: document.createElement('div')};
  const focusContainer = {current: document.createElement('div')};
  return renderHook(
    ({items}: {items: number[]}) =>
      useListWindow({
        items,
        keys: items,
        rowCount: items.length,
        pitch: PITCH,
        isEligible: true,
        canWindow: true,
        geometry,
        viewport,
        focusContainer,
      }),
    {initialProps: {items: keys}},
  );
}

describe('useListWindow', () => {
  it('mounts only the visible rows plus four per side in a 10k list', () => {
    const geometry = createGeometry({
      viewportHeight: 200,
      scrollTop: 20 * 5000,
      startOffset: 0,
      isMeasured: true,
    });
    const {result} = renderList(keysOf(10_000), geometry.source);
    expect(result.current.isWindowed).toBe(true);
    expect(result.current.plan).toMatchObject({start: 4996, end: 5014});
    expect(result.current.segments).toEqual([
      {type: 'gap', start: 0, end: 4996, height: 4996 * 20},
      {type: 'rows', start: 4996, end: 5014},
      {type: 'gap', start: 5014, end: 10_000, height: 4986 * 20},
    ]);
  });

  it('keeps one focused row mounted after it scrolls out of the window', () => {
    const geometry = createGeometry({
      viewportHeight: 200,
      scrollTop: 0,
      startOffset: 0,
      isMeasured: true,
    });
    const {result} = renderList(keysOf(1000), geometry.source);
    act(() => result.current.onItemFocus(2));
    act(() => geometry.publish({scrollTop: 20 * 500}));
    expect(result.current.segments).toContainEqual({
      type: 'rows',
      start: 2,
      end: 3,
    });
    act(() => result.current.onItemBlur());
    expect(result.current.segments).not.toContainEqual({
      type: 'rows',
      start: 2,
      end: 3,
    });
  });

  it('keeps the first visible key in place when rows are inserted above it', () => {
    const geometry = createGeometry({
      viewportHeight: 200,
      scrollTop: 20 * 100 + 7,
      startOffset: 0,
      isMeasured: true,
    });
    const {result, rerender} = renderList(keysOf(1000), geometry.source);
    expect(result.current.plan?.firstVisibleIndex).toBe(100);
    // Ten new keys before the old first key move it ten rows down.
    rerender({items: [...keysOf(10, -10), ...keysOf(1000)]});
    expect(result.current.plan?.firstVisibleIndex).toBe(110);
    expect(result.current.plan?.offset).toBe(7);
  });

  it('renders every row and subscribes to nothing when it may not window', () => {
    let subscriptions = 0;
    const geometry = createGeometry({
      viewportHeight: 200,
      scrollTop: 0,
      startOffset: 0,
      isMeasured: true,
    });
    const counting: ListWindowGeometrySource = {
      ...geometry.source,
      subscribe(listener) {
        subscriptions++;
        return geometry.source.subscribe(listener);
      },
    };
    const viewport = {current: null};
    const {result} = renderHook(() =>
      useListWindow({
        items: keysOf(50),
        keys: keysOf(50),
        rowCount: 50,
        pitch: PITCH,
        isEligible: true,
        canWindow: false,
        geometry: counting,
        viewport,
        focusContainer: viewport,
      }),
    );
    expect(result.current.isWindowed).toBe(false);
    expect(result.current.segments).toEqual([
      {type: 'rows', start: 0, end: 50},
    ]);
    expect(subscriptions).toBe(0);
  });
});
