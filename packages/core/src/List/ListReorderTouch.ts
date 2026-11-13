// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ListReorderTouch.ts
 * @input The gesture system's long press and host, the reorder claim values
 *   (motion/uikit/reorder.ts) and the selection lock (utils/selectionLock.ts)
 * @output The List reorder's touch layer. `attachTouchHold` is the list's one
 *   hold, which picks up a row from its handle under a finger
 * @position Imported by List/listReorderEngine.tsx alone: what the reorder
 *   runs only under a finger sits behind this one import. The rows' glide,
 *   which every pointer's drop plays, is List/listReorderGlide.ts
 *
 * UIKit's reorder control (iOS 26.2, measured): a finger held still on it for
 * the scroll view's content-touch delay (150 ms) claims the drag. A flick that
 * starts on it scrolls the table instead. So until the claim, the handle
 * leaves the browser its pans and pinch-zoom (`manipulation`).
 * The long press then holds the touch, through the gesture system's blocking
 * listener for a mid-gesture claim. A second finger before the claim makes
 * it the browser's pinch (WCAG 1.4.4). After the claim, extra fingers change
 * nothing. The gesture host owns the touch listeners and counts the fingers
 * on the screen. The hold keeps its own styles, so the list locks text
 * selection under a held finger itself. One hold serves the whole list. It
 * receives only the touches that begin on the list's handles, so the list's
 * blocking listener is its only one.
 *
 * SYNC: When modified, update List/listReorderEngine.tsx.
 */

import {getGestureHost} from '../gestures/GestureHost';
import {LongPressGestureRecognizer} from '../gestures/LongPressGestureRecognizer';
import type {PointerKind} from '../gestures/types';
import {reorder} from '../motion/uikit/reorder';
import {subscribeInput} from '../utils/inputStream';
import {lockSelection, locksSelectionFor} from '../utils/selectionLock';

/**
 * The list's hold: a finger held still for the content-touch delay on one of
 * its handles (a touch `receives` takes) picks up that handle's row.
 * `pointerTypes` are the pointers that hold: a finger always, and a pen where
 * the primary pointer is coarse. `isOnHandle` tells the touches that start on
 * a handle, which lock text selection until they lift. Returns the detach.
 */
export function attachTouchHold(
  list: HTMLElement,
  pointerTypes: ReadonlyArray<PointerKind>,
  receives: (target: unknown) => boolean,
  onGesture: (recognizer: LongPressGestureRecognizer) => void,
  isOnHandle: (target: unknown) => boolean,
): () => void {
  const host = getGestureHost(list.ownerDocument);
  const recognizer = new LongPressGestureRecognizer({
    name: 'List.reorder',
    minimumPressDuration: reorder.claim.delayMs,
    allowableMovement: reorder.claim.allowableMovement,
    allowedPointerTypes: pointerTypes,
    // Only the touches that begin on a handle: the rest of the list's
    // touches never reach the hold.
    shouldReceiveTouch: (_recognizer, touch) => receives(touch.target),
    // Only a lone finger: two are the browser's pinch, wherever the second
    // one landed (the gesture host counts every finger on the screen).
    shouldBegin: () => host.fingersDown() <= 1,
    // The hold keeps its own styles, so the list itself locks text
    // selection under a held finger.
  });
  const unlisten = recognizer.addListener(onGesture);
  // The handles set their own `touch-action`.
  const detach = host.attach(list, recognizer, {manageStyle: false});
  const unlock = lockSelectionWhileHeld(list, pointerTypes, isOnHandle);
  return () => {
    detach();
    unlisten();
    unlock();
  };
}

/**
 * The hold's selection lock. The host leaves it to the list, since the list
 * keeps its own styles. From a finger's or a pen's touch-down on a handle
 * until it lifts, no text on the list starts a selection or the callout.
 * iOS starts its own selection under a still finger before the hold claims
 * the drag, so the lock starts at the touch-down. Returns the detach.
 */
function lockSelectionWhileHeld(
  list: HTMLElement,
  pointerTypes: ReadonlyArray<PointerKind>,
  isOnHandle: (target: unknown) => boolean,
): () => void {
  const view = list.ownerDocument.defaultView;
  if (view == null) {
    return () => {};
  }
  const held = new Map<number, () => void>();
  const release = (event: PointerEvent) => {
    held.get(event.pointerId)?.();
    held.delete(event.pointerId);
  };
  const unsubscribe = [
    subscribeInput(view, 'pointerdown', event => {
      if (
        locksSelectionFor(event.pointerType) &&
        pointerTypes.some(type => type === event.pointerType) &&
        isOnHandle(event.target)
      ) {
        release(event);
        held.set(event.pointerId, lockSelection([list], event.target));
      }
    }),
    subscribeInput(view, 'pointerup', release),
    subscribeInput(view, 'pointercancel', release),
  ];
  return () => {
    for (const stop of unsubscribe) {
      stop();
    }
    for (const unlockHeld of held.values()) {
      unlockHeld();
    }
    held.clear();
  };
}
