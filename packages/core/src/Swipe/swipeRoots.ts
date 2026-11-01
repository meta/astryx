// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file swipeRoots.ts
 * @input A row root and its swipe's key handler
 * @output Exports registerSwipeRoot, which the swipe layer calls for the row
 *   root it attaches to, and swipeRootProps, the handlers a row given `swipe`
 *   carries on that root
 * @position Internal to the Swipe module: the runtime's own routing from a
 *   row root to the swipe that serves it, so a row holds no bridge of its own
 *   (`spec:AST-057` FR10). Tested through Item.test.tsx.
 */

import type {KeyboardEvent} from 'react';

type KeyHandler = (event: KeyboardEvent) => void;

/** The key handler of the swipe serving each row root. */
const keyHandlers = new WeakMap<Element, KeyHandler>();

/**
 * Routes the root's key events to `onKeyDown` until the returned function
 * runs. The layer registers after it mounts; React flushes effects before it
 * delivers a discrete event, so a key never meets a root without its handler.
 */
export function registerSwipeRoot(
  root: Element,
  onKeyDown: KeyHandler,
): () => void {
  keyHandlers.set(root, onKeyDown);
  return () => {
    if (keyHandlers.get(root) === onKeyDown) {
      keyHandlers.delete(root);
    }
  };
}

/**
 * The handlers a served row carries on its root: the same functions for every
 * row and every Swipe value, so a new value from an inline `createSwipe` call
 * changes nothing on the root (`spec:AST-057` FR11). Each finds the swipe the
 * event's root registered. Escape closes a resting row with focus inside it
 * (FR7), stopping the event there as React handlers do.
 */
export const swipeRootProps = {
  onKeyDown(event: KeyboardEvent) {
    keyHandlers.get(event.currentTarget)?.(event);
  },
} as const;
