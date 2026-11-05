// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file gestureCounter.ts
 * @input Listens for pointerdown, pointerup, pointercancel, contextmenu,
 *   keydown, and click on the document
 * @output Exports the current gesture identity, whether its click has run,
 *   and claimContextMenuPress, which keeps the release of the press that
 *   opened a layer from dismissing it
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
  document.addEventListener('pointerdown', startPress, true);
  document.addEventListener('pointerup', endPress, true);
  document.addEventListener('pointercancel', endPress, true);
  document.addEventListener('contextmenu', markContextMenu, true);
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
 * press opened a context menu (a right click, or a held finger). The browser's
 * light dismiss reads a release outside every open popover as a dismissal,
 * also the release of the press that opened the popover. A pointer captured
 * by the layer releases on the layer, so that press cannot also close it. The
 * browser drops the capture at the release. A later press dismisses as usual.
 */
export function claimContextMenuPress(layer: HTMLElement): void {
  listen();
  if (pressPointerId === null || contextMenuGesture !== gesture) {
    return;
  }
  try {
    layer.setPointerCapture(pressPointerId);
  } catch {
    // The pointer is no longer active (its release did not reach the page),
    // so no release can dismiss the layer.
  }
}
