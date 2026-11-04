// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file lazyToastSwipeClaim.ts
 * @input Uses React lazy and Suspense, useIsHydrating and ToastSwipeClaim
 * @output Exports `ToastSwipeClaim`, which loads its module on its first
 *   render, and `preloadToastSwipeClaimWhenIdle`, which loads it at idle
 * @position Internal to Toast: the claim of its swipe
 *
 * The claim brings in the gesture host, so no import of Toast or Layer holds
 * it (Popover/lazyPopoverBottomSheet.ts does the same for the sheet). It loads
 * when the page is idle after its load event, or when the first toast shows,
 * whichever comes first. It renders nothing until the module loads, and
 * nothing on the server or in the render that hydrates server HTML.
 * A module that fails to load (offline, or removed by a deploy) gives a claim
 * that renders nothing. The toast stays, and the page keeps the touch.
 */

import {
  createElement,
  lazy,
  Suspense,
  type ComponentProps,
  type ReactElement,
} from 'react';
import type {ToastSwipeClaim as EagerToastSwipeClaim} from './ToastSwipeClaim';
import {useIsHydrating} from '../hooks/useIsHydrating';
import {subscribeInput} from '../utils/inputStream';

const loadToastSwipeClaim = async () => import('./ToastSwipeClaim');

/**
 * Calls `callback` once the page is idle after its load event: through
 * `requestIdleCallback` where the browser has it, otherwise in the next task.
 * Safari has no `requestIdleCallback`. Returns a function that cancels it.
 */
export function whenPageIdle(view: Window, callback: () => void): () => void {
  let cancel = (): void => {};
  const schedule = (): void => {
    if (typeof view.requestIdleCallback === 'function') {
      const id = view.requestIdleCallback(callback);
      cancel = () => view.cancelIdleCallback(id);
    } else {
      const id = view.setTimeout(callback, 0);
      cancel = () => view.clearTimeout(id);
    }
  };
  if (view.document.readyState === 'complete') {
    schedule();
  } else {
    // Resource loads reach the window's capture phase too. The page's own
    // load event targets its document.
    const unsubscribe = subscribeInput(view, 'load', event => {
      if (event.target === view.document || event.target === view) {
        unsubscribe();
        schedule();
      }
    });
    cancel = unsubscribe;
  }
  return () => cancel();
}

/**
 * Loads the claim's module once the page is idle, so the first toast's swipe
 * need not wait for it. A failed load is ignored. The claim's own load then
 * gives NoClaim, unless the bundler retries the chunk.
 */
export function preloadToastSwipeClaimWhenIdle(view: Window): () => void {
  return whenPageIdle(view, () => {
    loadToastSwipeClaim().catch(() => {});
  });
}

function NoClaim(): null {
  return null;
}

const LazyToastSwipeClaim = lazy(async () =>
  loadToastSwipeClaim().then(
    module => ({default: module.ToastSwipeClaim}),
    () => ({default: NoClaim}),
  ),
);

export function ToastSwipeClaim(
  props: ComponentProps<typeof EagerToastSwipeClaim>,
): ReactElement | null {
  if (useIsHydrating()) {
    return null;
  }
  return createElement(
    Suspense,
    {fallback: null},
    createElement(LazyToastSwipeClaim, props),
  );
}
