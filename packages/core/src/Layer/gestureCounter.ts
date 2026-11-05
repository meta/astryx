// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file gestureCounter.ts
 * @input Listens for pointerdown, keydown, and click on the document
 * @output Exports the current gesture identity and whether its click has run
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
let isListening = false;

function advance() {
  gesture += 1;
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
  document.addEventListener('pointerdown', advance, true);
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
