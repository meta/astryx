// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file gestureCounter.ts
 * @input Pointer and context-menu events through the shared input stream;
 *   keydown and click on the document
 * @output Exports the gesture identity, whether its click has run, and
 *   claimContextMenuPress
 * @position Internal to Layer; used by useLayer to tell a click that belongs
 *   to a dismissing press from a fresh one
 *
 * A browser light-dismiss and the trigger's own click come from ONE press, and
 * which of them React sees first is a race. Comparing timestamps against a
 * window guesses; counting gestures does not. The counter advances on every
 * new press or keystroke, so "the click from the gesture that dismissed the
 * layer" is exactly "the click while the counter still reads what it read at
 * the dismissal", no matter how long the main thread was blocked in between.
 */

import {subscribeInput} from '../utils/inputStream';

let gesture = 0;
let clickedGesture: number | null = null;
let contextMenuGesture: number | null = null;
let pressPointerId: number | null = null;
let isListening = false;

function advance() {
  gesture += 1;
}

function startPress(event: PointerEvent) {
  advance();
  pressPointerId = event.pointerId;
}

function endPress() {
  pressPointerId = null;
}

function markContextMenu() {
  contextMenuGesture = gesture;
}

function markClicked() {
  clickedGesture = gesture;
}

function listen() {
  if (isListening || typeof document === 'undefined') {
    return;
  }
  isListening = true;
  // Capture phase: the count must advance before any handler reads it.
  const view = document.defaultView;
  if (view != null) {
    subscribeInput(view, 'pointerdown', startPress, {first: true});
    subscribeInput(view, 'pointerup', endPress, {first: true});
    subscribeInput(view, 'pointercancel', endPress, {first: true});
    subscribeInput(view, 'contextmenu', markContextMenu, {first: true});
  }
  document.addEventListener('keydown', advance, true);
  // Capture phase observes the click even when a consumer stops propagation.
  document.addEventListener('click', markClicked, true);
}

/**
 * Identifies the user gesture in flight. Two reads returning the same value
 * happened within one press (or one keystroke).
 */
export function currentGesture(): number {
  listen();
  return gesture;
}

/** Whether the click belonging to the current gesture already bubbled. */
export function currentGestureHasClicked(): boolean {
  listen();
  return clickedGesture === gesture;
}

/**
 * Keeps the release of the press in flight from dismissing `layer`, when that
 * press opened a context menu (a right click). The browser's light dismiss
 * reads a release outside every open popover as a dismissal, also the release
 * of the press that opened the popover. While the pointer is outside the
 * layer, the layer captures it, so a release there lands on the layer. Over
 * the layer the capture lets go, so hover works and a release there is inside
 * anyway. The claim ends at that press's release; a later press dismisses as
 * usual.
 */
export function claimContextMenuPress(layer: HTMLElement): void {
  listen();
  const pointerId = pressPointerId;
  const view = layer.ownerDocument.defaultView;
  if (pointerId === null || contextMenuGesture !== gesture || view == null) {
    return;
  }
  const holdCapture = (isOutside: boolean) => {
    try {
      if (isOutside) {
        layer.setPointerCapture(pointerId);
      } else if (layer.hasPointerCapture(pointerId)) {
        layer.releasePointerCapture(pointerId);
      }
    } catch {
      // The pointer is no longer active (its release did not reach the
      // page), so no release can dismiss the layer.
    }
  };
  holdCapture(true);
  // Hit testing ignores the capture, so it finds what is under the pointer.
  const followPointer = (event: PointerEvent) => {
    if (event.pointerId === pointerId) {
      const under = layer.ownerDocument.elementFromPoint(
        event.clientX,
        event.clientY,
      );
      holdCapture(under == null || !layer.contains(under));
    }
  };
  const unsubscribes: (() => void)[] = [];
  const endClaim = (event: PointerEvent) => {
    if (event.pointerId === pointerId) {
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
    }
  };
  unsubscribes.push(
    subscribeInput(view, 'pointermove', followPointer),
    subscribeInput(view, 'pointerup', endClaim),
    subscribeInput(view, 'pointercancel', endClaim),
  );
}
