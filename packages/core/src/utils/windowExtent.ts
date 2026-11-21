// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file windowExtent.ts
 * @input The window's innerWidth and innerHeight, and the shared resize
 *   observer on the root element
 * @output readWindowExtent, standInMaximum, and a shared window-width store
 *   (subscribeToWindowWidth, readWindowWidth, readNoWindowWidth) for
 *   useSyncExternalStore
 * @position Internal shared measurement, not re-exported from the utils
 *   entry. Resizable and Table's column resize read it for the maximum an
 *   unbounded separator announces.
 */

import {observeResize} from './sharedResizeObserver';

/** The window's extent along an axis, or null where there is no window. */
export function readWindowExtent(
  direction: 'horizontal' | 'vertical',
): number | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return direction === 'vertical' ? window.innerHeight : window.innerWidth;
}

/**
 * The maximum an unbounded separator announces: the measured extent, never
 * below the value it announces or its minimum. Undefined with no extent, so
 * the separator renders no maximum.
 */
export function standInMaximum(
  extent: number | null,
  value: number,
  min: number,
): number | undefined {
  return extent == null ? undefined : Math.max(extent, value, min);
}

// The window's width, as the shared resize observer on the root element last
// reported it. A render reads this value, never `innerWidth`: after a
// commit's DOM writes, that read forces a layout. Every subscriber shares one
// observation. With none, the value is null, because nothing keeps it current.
let windowWidth: number | null = null;
const windowWidthListeners = new Set<() => void>();
let stopObserving: (() => void) | null = null;

// The observer reports after layout, so reading the width here forces none.
function handleRootResize(): void {
  windowWidth = window.innerWidth;
  for (const listener of windowWidthListeners) {
    listener();
  }
}

/** Subscribes to the window's width, for `useSyncExternalStore`. */
export function subscribeToWindowWidth(onChange: () => void): () => void {
  windowWidthListeners.add(onChange);
  // The observation reports once at once, so a resize between the first
  // render and this subscription still reaches the store.
  stopObserving ??= observeResize(document.documentElement, handleRootResize);
  return () => {
    windowWidthListeners.delete(onChange);
    if (windowWidthListeners.size === 0) {
      stopObserving?.();
      stopObserving = null;
      windowWidth = null;
    }
  };
}

/** The window's width from the shared store; one read when none is held. */
export function readWindowWidth(): number {
  windowWidth ??= window.innerWidth;
  return windowWidth;
}

/** The server's snapshot: no window, so no width. */
export function readNoWindowWidth(): null {
  return null;
}
