// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file clickGuard.ts
 * @input A document whose gesture already acted (a menu row's release, a
 *   touch a gesture recognizer claimed)
 * @output Exports armClickGuard, disarmClickGuard, isClickGuardArmed,
 *   withoutClickGuard and CLICK_GUARD_WINDOW_MS
 * @position The one guard for the browser's click after a gesture that
 *   already acted (useMenuPress FR5, `spec:AST-057` FR6), shared by the menu
 *   press model (hooks/useMenuPress.ts) and the gesture host
 *   (gestures/GestureHost.ts)
 *
 * Armed at a tracked release, it swallows the next click the browser
 * reports, on the window's capture phase through the input stream
 * (utils/inputStream.ts), so no framework sees it. It disarms on that click,
 * at the next `pointerdown` (a new gesture, whose click must act), or after
 * {@link CLICK_GUARD_WINDOW_MS}. While disarmed it has no listener at all.
 *
 * Some clicks always pass:
 * - a click whose `detail` is 0: a keyboard's, a screen reader's, or an
 *   activation the page dispatches;
 * - a click dispatched inside {@link withoutClickGuard}: a menu row's own
 *   activation, or a recognizer's replayed or retargeted click;
 * - the hidden haptic switch's click (gestures/haptics.ts), the tap's own
 *   feedback.
 *
 * SYNC: When modified, update clickGuard.test.ts, hooks/useMenuPress.ts and
 * gestures/GestureHost.ts.
 */

import {HAPTIC_SWITCH_ATTRIBUTE} from '../gestures/hapticSwitch';
import {subscribeInput} from './inputStream';

/**
 * How long after a release the browser's click is still swallowed, in ms.
 * Browsers report it right after the release; the next `pointerdown`
 * disarms the guard first, so this bounds only a click that never comes.
 */
export const CLICK_GUARD_WINDOW_MS = 400;

interface Guard {
  readonly unsubscribers: (() => void)[];
  timer: ReturnType<typeof setTimeout> | null;
}

const guards = new Map<Document, Guard>();
let unguardedDepth = 0;

/** Swallow the browser's next click on `doc` (see the file header). */
export function armClickGuard(doc: Document): void {
  const view = doc.defaultView;
  if (view == null) {
    return;
  }
  disarmClickGuard(doc);
  const guard: Guard = {unsubscribers: [], timer: null};
  guards.set(doc, guard);
  guard.unsubscribers.push(
    subscribeInput(
      view,
      'click',
      event => {
        if (isExempt(event)) {
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        disarmClickGuard(doc);
      },
      {cancels: true},
    ),
    // The next press is a new gesture: its click must never be eaten.
    subscribeInput(view, 'pointerdown', () => disarmClickGuard(doc)),
  );
  guard.timer = setTimeout(() => disarmClickGuard(doc), CLICK_GUARD_WINDOW_MS);
}

/** Stop swallowing on `doc`; idempotent. */
export function disarmClickGuard(doc: Document): void {
  const guard = guards.get(doc);
  if (guard == null) {
    return;
  }
  guards.delete(doc);
  if (guard.timer != null) {
    clearTimeout(guard.timer);
  }
  for (const unsubscribe of guard.unsubscribers) {
    unsubscribe();
  }
}

/** Whether the guard on `doc` would swallow the next click. */
export function isClickGuardArmed(doc: Document): boolean {
  return guards.has(doc);
}

/**
 * Run `dispatch`, letting through every click it dispatches: a click the
 * caller reports itself after the gesture (a row's activation, a replayed or
 * retargeted click).
 */
export function withoutClickGuard<T>(dispatch: () => T): T {
  unguardedDepth++;
  try {
    return dispatch();
  } finally {
    unguardedDepth--;
  }
}

/** Test-only: disarm every guard between cases. */
export function __resetClickGuardForTest(): void {
  for (const doc of [...guards.keys()]) {
    disarmClickGuard(doc);
  }
}

function isExempt(event: MouseEvent): boolean {
  if (event.detail === 0 || unguardedDepth > 0) {
    return true;
  }
  return (
    event.target instanceof Element &&
    event.target.hasAttribute(HAPTIC_SWITCH_ATTRIBUTE)
  );
}
