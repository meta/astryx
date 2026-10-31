// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file clickGuard.ts
 * @input A document whose gesture already acted (a menu row's release, a
 *   touch a gesture recognizer claimed)
 * @output Exports armClickGuard (and its ClickGuardOptions),
 *   disarmClickGuard, isClickGuardArmed, withoutClickGuard and
 *   CLICK_GUARD_WINDOW_MS
 * @position The one guard for the browser's click after a gesture that
 *   already acted (useMenuPress FR5, `spec:AST-057` FR6), shared by the menu
 *   press model (hooks/useMenuPress.ts) and the gesture host
 *   (gestures/GestureHost.ts)
 *
 * Armed at a tracked release, it swallows the next click the browser
 * reports, on the window's capture phase through the input stream
 * (utils/inputStream.ts), so no framework sees it. It disarms on that click,
 * at the next `pointerdown` (a new gesture, whose click must act), or after
 * {@link CLICK_GUARD_WINDOW_MS}; disarmed, it lets every click pass. Its
 * click listener comes with an arm. Once the menu press model arms it, it
 * stays: installed once per document and armed per gesture, it keeps its
 * place ahead of any window listener the page adds later
 * (`module:DropdownMenu/useMenuPress` PR2, which `spec:AST-094` FR24 counts
 * once per page). Armed only by the gesture host, it goes when the guard
 * disarms: a release-armed swallower is press work (FR24).
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

import {HAPTIC_SWITCH_ATTRIBUTE} from './hapticSwitch';
import {subscribeInput} from './inputStream';

/**
 * How long after a release the browser's click is still swallowed, in ms.
 * Browsers report it right after the release; the next `pointerdown`
 * disarms the guard first, so this bounds only a click that never comes.
 */
export const CLICK_GUARD_WINDOW_MS = 400;

/** Options for {@link armClickGuard}. */
export interface ClickGuardOptions {
  /**
   * The menu press model's arm: the window's click listener stays from then
   * on (`module:DropdownMenu/useMenuPress` PR2). Any other arm keeps it only
   * while the guard is armed (`spec:AST-094` FR24).
   * @default false
   */
  readonly staysInstalled?: boolean;
}

interface Guard {
  readonly unsubscribers: (() => void)[];
  timer: ReturnType<typeof setTimeout> | null;
}

const guards = new Map<Document, Guard>();
/** The click listeners that stay, by window: the menu press model's (PR2). */
const stayingClickListeners = new WeakMap<Window, () => void>();
let unguardedDepth = 0;

/** Listen for the next click on `view`'s capture phase; returns the stop. */
function listenForClicks(view: Window): () => void {
  return subscribeInput(
    view,
    'click',
    event => {
      const doc = view.document;
      if (!guards.has(doc) || isExempt(event)) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      disarmClickGuard(doc);
    },
    {cancels: true},
  );
}

/** Swallow the browser's next click on `doc` (see the file header). */
export function armClickGuard(
  doc: Document,
  {staysInstalled = false}: ClickGuardOptions = {},
): void {
  const view = doc.defaultView;
  if (view == null) {
    return;
  }
  disarmClickGuard(doc);
  const guard: Guard = {unsubscribers: [], timer: null};
  if (staysInstalled && !stayingClickListeners.has(view)) {
    stayingClickListeners.set(view, listenForClicks(view));
  }
  if (!stayingClickListeners.has(view)) {
    // The gesture host's arm: the click listener lasts while this guard does.
    guard.unsubscribers.push(listenForClicks(view));
  }
  guards.set(doc, guard);
  guard.unsubscribers.push(
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

/**
 * Test-only: disarm every guard between cases, and drop the current window's
 * staying click listener, as on a fresh page.
 */
export function __resetClickGuardForTest(): void {
  for (const doc of [...guards.keys()]) {
    disarmClickGuard(doc);
  }
  if (typeof window !== 'undefined') {
    stayingClickListeners.get(window)?.();
    stayingClickListeners.delete(window);
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
