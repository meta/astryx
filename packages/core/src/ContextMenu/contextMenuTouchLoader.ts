// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file contextMenuTouchLoader.ts
 * @input Nothing from the caller: ContextMenu calls `useContextMenuTouchLayer`
 *   while its touch model applies
 * @output The touch layer once the page has loaded it, else `null`
 * @position ContextMenu's one load of its touch layer, after first paint
 *
 * SYNC: When modified, update /packages/core/src/ContextMenu/ContextMenu.tsx
 */

import {useEffect, useSyncExternalStore} from 'react';
import {createModuleLoader} from '../utils/moduleLoader';
import type {ContextMenuTouchLayer as TouchLayer} from './ContextMenuTouchLayer';

// The touch layer brings the gesture host, the arena and the long-press
// recognizer. A page that never holds a finger on a ContextMenu must not pay
// for them in its first load. So the first ContextMenu under the touch model
// schedules one load: after the page's first paint, when the main thread is
// idle, and no later than LOAD_CAP_MS after that paint. An input never starts
// or hurries the load. A finger that lands before the load is the layer's to
// take when it mounts.

/**
 * The latest the load starts after first paint, in ms, when the main thread
 * never goes idle.
 */
export const LOAD_CAP_MS = 2000;

let layer: typeof TouchLayer | null = null;
let isScheduled = false;
const listeners = new Set<() => void>();

const layerModule = createModuleLoader(
  async () => import('./ContextMenuTouchLayer'),
);

function getLayer(): typeof TouchLayer | null {
  return layer;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(loaded: typeof TouchLayer | null): void {
  layer = loaded;
  for (const listener of [...listeners]) {
    listener();
  }
}

function load(): void {
  layerModule.load().then(
    loaded => publish(loaded.ContextMenuTouchLayer),
    // A chunk that fails to load leaves the menu on right clicks and keys.
    () => {},
  );
}

function scheduleLoad(): void {
  if (isScheduled) {
    return;
  }
  isScheduled = true;
  // The timers belong to this window, so they end with its document.
  const view = window;
  // A frame callback runs before the frame paints. The task it queues runs
  // after that paint.
  view.requestAnimationFrame(() => {
    view.setTimeout(() => {
      if (typeof view.requestIdleCallback === 'function') {
        view.requestIdleCallback(load, {timeout: LOAD_CAP_MS});
      } else {
        load();
      }
    }, 0);
  });
}

/**
 * The touch layer once the page has loaded it, else `null`. A ContextMenu
 * that wants it schedules the page's one load. The server and the hydration
 * render read `null`, so the markup matches.
 */
export function useContextMenuTouchLayer(
  isWanted: boolean,
): typeof TouchLayer | null {
  const current = useSyncExternalStore(subscribe, getLayer, () => null);
  // Syncs the page's one load of the touch layer with the first ContextMenu
  // under the touch model.
  useEffect(() => {
    if (isWanted) {
      scheduleLoad();
    }
  }, [isWanted]);
  return isWanted ? current : null;
}

/** Test only: loads the layer now and makes every reader see it. */
export async function __loadContextMenuTouchLayerForTest(): Promise<void> {
  publish((await layerModule.load()).ContextMenuTouchLayer);
  isScheduled = true;
}

/** Test only: forgets the loaded layer and any scheduled load. */
export function __resetContextMenuTouchLayerForTest(): void {
  isScheduled = false;
  publish(null);
}
