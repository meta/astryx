// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file windowExtent.ts
 * @input The window's innerWidth and innerHeight, and its resize events
 * @output readWindowExtent, standInMaximum, and a shared window-width store
 *   (subscribeToWindowWidth, readWindowWidth, readNoWindowWidth) for
 *   useSyncExternalStore
 * @position Internal shared measurement, not re-exported from the utils
 *   entry. Resizable and Table's column resize read it for the maximum an
 *   unbounded separator announces.
 */

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

// The window's width, as the shared `resize` listener last read it. A render
// reads this value, never `innerWidth`: after a commit's DOM writes, that
// read forces a layout. Every subscriber shares one listener. With none, the
// value is null, because nothing keeps it current.
let windowWidth: number | null = null;
const windowWidthListeners = new Set<() => void>();
let isListening = false;

function handleWindowResize(): void {
  windowWidth = window.innerWidth;
  for (const listener of windowWidthListeners) {
    listener();
  }
}

/** Subscribes to the window's width, for `useSyncExternalStore`. */
export function subscribeToWindowWidth(onChange: () => void): () => void {
  windowWidthListeners.add(onChange);
  if (!isListening) {
    window.addEventListener('resize', handleWindowResize);
    isListening = true;
    // A resize between the first render and this listener has no event left
    // to deliver, so read the width now.
    windowWidth = window.innerWidth;
  }
  return () => {
    windowWidthListeners.delete(onChange);
    if (windowWidthListeners.size === 0) {
      window.removeEventListener('resize', handleWindowResize);
      isListening = false;
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
