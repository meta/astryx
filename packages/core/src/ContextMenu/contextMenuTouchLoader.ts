// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file contextMenuTouchLoader.ts
 * @input No props: ContextMenu calls `useContextMenuTouchLayer` while its
 *   touch model applies
 * @output The touch layer after the page loads it, `null` until then, and
 *   whether its latest load failed; a new load after a failure
 * @position Between ContextMenu and its touch layer: loads the layer after
 *   first paint
 *
 * SYNC: When modified, update /packages/core/src/ContextMenu/ContextMenu.tsx
 */

import {useEffect, useSyncExternalStore, type RefObject} from 'react';
import {warnOnce} from '../utils/devWarning';
import {createModuleLoader} from '../utils/moduleLoader';
import type {ContextMenuTouchLayer as TouchLayer} from './ContextMenuTouchLayer';

// The touch layer imports the long-press recognizer, which brings the arena
// and the gesture host. These modules stay out of the page's first load. The
// first ContextMenu under the touch model in each window asks for them, and
// the page loads them once. The request waits until that window's next frame
// has painted, then for an idle moment, capped at LOAD_CAP_MS. Touches, clicks
// and keys do not change when the load starts. As the layer mounts, it takes
// a finger that landed before the load.

/**
 * How long the load waits for an idle main thread after that paint, in ms.
 * Past it, the load starts anyway.
 */
export const LOAD_CAP_MS = 2000;

/** What a ContextMenu reads of the page's touch layer. */
export interface ContextMenuTouchLayerState {
  /** The touch layer once it has loaded, else `null`. */
  readonly layer: typeof TouchLayer | null;
  /** Whether the latest load failed. The next touch on a trigger asks again. */
  readonly hasFailed: boolean;
}

const NOT_LOADED: ContextMenuTouchLayerState = {layer: null, hasFailed: false};

let state: ContextMenuTouchLayerState = NOT_LOADED;
// The windows whose triggers scheduled the load. Each schedules its own, so a
// window that paints no frame (a hidden tab, a closed frame) stalls no other.
let scheduledViews = new WeakSet<Window>();
let pendingLoad: Promise<void> | null = null;
const listeners = new Set<() => void>();

const layerModule = createModuleLoader(
  async () => import('./ContextMenuTouchLayer'),
);

function getState(): ContextMenuTouchLayerState {
  return state;
}

function getServerState(): ContextMenuTouchLayerState {
  return NOT_LOADED;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(next: ContextMenuTouchLayerState): void {
  state = next;
  for (const listener of [...listeners]) {
    listener();
  }
}

function load(): void {
  pendingLoad ??= layerModule.load().then(
    loaded => {
      pendingLoad = null;
      publish({layer: loaded.ContextMenuTouchLayer, hasFailed: false});
    },
    (error: unknown) => {
      pendingLoad = null;
      // The next touch on a trigger asks again.
      publish({layer: null, hasFailed: true});
      warnOnce(
        'ContextMenu:touch-layer-load',
        'ContextMenu',
        'the touch layer failed to load. Until a later touch loads it, a held finger opens the menu after 500 ms.',
        error,
      );
    },
  );
}

function scheduleLoad(view: Window): void {
  if (state.layer != null || scheduledViews.has(view)) {
    return;
  }
  scheduledViews.add(view);
  // The timers belong to the trigger's window, so they end with its document.
  // The frame callback runs just before that frame paints, so the timeout it
  // sets runs just after the paint.
  view.requestAnimationFrame(() => {
    view.setTimeout(() => {
      if (typeof view.requestIdleCallback === 'function') {
        view.requestIdleCallback(load, {timeout: LOAD_CAP_MS});
      } else {
        view.setTimeout(load, 0);
      }
    }, 0);
  });
}

/**
 * Loads the touch layer again after a failed load. A touch on a trigger calls
 * it: that touch is the intent that asks.
 */
export function retryContextMenuTouchLayer(): void {
  if (!state.hasFailed || pendingLoad != null) {
    return;
  }
  load();
}

/**
 * The touch layer after the page loads it, `null` until then, and whether its
 * latest load failed. The first ContextMenu that wants it asks for the load,
 * and later ones share it. It is `null` on the server and while hydrating, so
 * both renders produce the same markup. `triggerRef` names the window whose
 * frame and idle time start the load; the page's own window by default.
 */
export function useContextMenuTouchLayer(
  isWanted: boolean,
  triggerRef?: RefObject<Element | null>,
): ContextMenuTouchLayerState {
  const current = useSyncExternalStore(subscribe, getState, getServerState);
  // Syncs with the trigger window's frame and idle timers, which decide when
  // the touch layer loads.
  useEffect(() => {
    if (isWanted) {
      scheduleLoad(triggerRef?.current?.ownerDocument.defaultView ?? window);
    }
  }, [isWanted, triggerRef]);
  return isWanted ? current : NOT_LOADED;
}

/**
 * Test only: loads the layer at once and hands it to every hook that reads
 * it.
 */
export async function __loadContextMenuTouchLayerForTest(): Promise<void> {
  const loaded = await layerModule.load();
  publish({layer: loaded.ContextMenuTouchLayer, hasFailed: false});
}

/** Test only: drops the loaded layer and clears the scheduled loads. */
export function __resetContextMenuTouchLayerForTest(): void {
  scheduledViews = new WeakSet();
  pendingLoad = null;
  publish(NOT_LOADED);
}
