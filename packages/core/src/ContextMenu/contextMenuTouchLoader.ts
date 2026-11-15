// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file contextMenuTouchLoader.ts
 * @input No props: ContextMenu calls `useContextMenuTouchLayer` while its
 *   touch model applies
 * @output The touch layer after the page loads it; `null` until then
 * @position Between ContextMenu and its touch layer: loads the layer after
 *   first paint
 *
 * SYNC: When modified, update /packages/core/src/ContextMenu/ContextMenu.tsx
 */

import {useEffect, useSyncExternalStore} from 'react';
import {createModuleLoader} from '../utils/moduleLoader';
import type {ContextMenuTouchLayer as TouchLayer} from './ContextMenuTouchLayer';

// The touch layer imports the long-press recognizer, which brings the arena
// and the gesture host. These modules stay out of the page's first load. The
// first ContextMenu under the touch model asks for them once. The request
// waits until the next frame has painted, then for an idle moment, capped at
// LOAD_CAP_MS. Touches, clicks and keys do not change when the load starts.
// As the layer mounts, it takes a finger that landed before the load.

/**
 * How long the load waits for an idle main thread after that paint, in ms.
 * Past it, the load starts anyway.
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
    // If the chunk fails, the menu still opens from right clicks and keys.
    () => {},
  );
}

function scheduleLoad(): void {
  if (isScheduled) {
    return;
  }
  isScheduled = true;
  // Timers from this window stop when its document goes away.
  const view = window;
  // The frame callback runs just before that frame paints, so the timeout it
  // sets runs just after the paint.
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
 * The touch layer after the page loads it, `null` until then. The first
 * ContextMenu that wants it asks for the load, and later ones share it. It is
 * `null` on the server and while hydrating, so both renders produce the same
 * markup.
 */
export function useContextMenuTouchLayer(
  isWanted: boolean,
): typeof TouchLayer | null {
  const current = useSyncExternalStore(subscribe, getLayer, () => null);
  // Syncs with the browser's frame and idle timers, which decide when the
  // touch layer loads.
  useEffect(() => {
    if (isWanted) {
      scheduleLoad();
    }
  }, [isWanted]);
  return isWanted ? current : null;
}

/**
 * Test only: loads the layer at once and hands it to every hook that reads
 * it.
 */
export async function __loadContextMenuTouchLayerForTest(): Promise<void> {
  publish((await layerModule.load()).ContextMenuTouchLayer);
  isScheduled = true;
}

/** Test only: drops the loaded layer and clears the scheduled load. */
export function __resetContextMenuTouchLayerForTest(): void {
  isScheduled = false;
  publish(null);
}
