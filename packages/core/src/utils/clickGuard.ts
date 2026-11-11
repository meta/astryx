// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file clickGuard.ts
 * @input A document whose gesture already acted (a menu row's release, a
 *   touch a gesture recognizer claimed)
 * @output armClickGuard (and its ClickGuardOptions), disarmClickGuard,
 *   isClickGuardArmed, withoutClickGuard and CLICK_GUARD_WINDOW_MS
 * @position The one guard for the browser's click after a gesture that
 *   already acted, shared by hooks/useMenuPress.ts, gestures/GestureHost.ts,
 *   utils/boxHold.ts and the keyboard module's tap route
 *   (keyboard/keyboardHeight.ts)
 *
 * SYNC: When modified, update clickGuard.test.ts, hooks/useMenuPress.ts,
 * gestures/GestureHost.ts and utils/boxHold.ts.
 */

// Armed at a tracked release, the guard swallows the next click on the
// window's capture phase (utils/inputStream.ts), so no framework sees it. It
// disarms on that click, at the next `pointerdown`, or after
// {@link CLICK_GUARD_WINDOW_MS}. After the menu press model arms it, its click
// listener stays, so it keeps its place ahead of window listeners that the
// page adds later (AST-057, AST-094). If only the gesture host arms it, the
// click listener stays only while the guard is armed.
//
// An arm at a claimed touch's lift also takes that touch's late `mousedown`
// and `mouseup`. WebKit sends them a few ms after a held tap's cancelled
// `touchend`, aimed at whatever is under the finger by then. They go with
// the click, the next `pointerdown` or the window, as the guard does.
//
// The menu press model's arm at a finger's release also cancels that touch's
// `touchend`, so the browser creates no click and no compatibility mouse
// events. It names the touch by its identifier, so another finger's
// `touchend` passes. A busy main thread can otherwise hold that click past the window,
// when a drill-in has put another row under the finger.
//
// Some clicks always pass:
// - a click with `detail` 0: a keyboard's, a screen reader's, or one that the
//   page dispatches;
// - a click dispatched inside {@link withoutClickGuard};
// - the hidden haptic switch's click (gestures/haptics.ts).

import {isHapticSwitch} from '../privateAttributes/hapticSwitch.stylex';
import {subscribeInput} from './inputStream';
import {realmValue, sharedKey} from './sharedRealm';

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
   * on. Any other arm keeps it only while the guard is armed.
   * @default false
   */
  readonly staysInstalled?: boolean;
  /**
   * The gesture host's arm at a claimed touch's lift: the guard also takes
   * that touch's late `mousedown` and `mouseup` while it is armed.
   * @default false
   */
  readonly takesLateMouse?: boolean;
  /**
   * The menu press model's arm at a finger's release: the guard also cancels
   * that touch's `touchend`, so the browser creates no click for it. A
   * cancelled `touchend` disarms the guard.
   * @default false
   */
  readonly cancelsTouchEnd?: boolean;
  /**
   * With `cancelsTouchEnd`: the `Touch.identifier` of the touch that lifted.
   * Only a `touchend` that ends this touch is cancelled. Another finger's
   * `touchend` passes, and the guard stays armed for this touch. Without it,
   * the next `touchend` counts as this touch's own.
   */
  readonly touchIdentifier?: number;
}

interface Guard {
  readonly unsubscribers: (() => void)[];
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * The click guard's state, registered, so a swizzled copy guards the same
 * clicks as the package.
 */
const guardState = realmValue(sharedKey('click-guard', 1), () => ({
  guards: new Map<Document, Guard>(),
  /** The click listeners that stay, by window: the menu press model's. */
  stayingClickListeners: new WeakMap<Window, () => void>(),
  unguardedDepth: 0,
}));
const {guards, stayingClickListeners} = guardState;

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
  {
    staysInstalled = false,
    takesLateMouse = false,
    cancelsTouchEnd = false,
    touchIdentifier,
  }: ClickGuardOptions = {},
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
  if (takesLateMouse) {
    for (const type of ['mousedown', 'mouseup'] as const) {
      guard.unsubscribers.push(
        subscribeInput(view, type, swallowLateMouse, {cancels: true}),
      );
    }
  }
  if (cancelsTouchEnd) {
    // A touch sends its pointerup before its touchend, so without an
    // identifier the next touchend counts as that touch's own. The next
    // pointerdown disarms the guard first.
    const stopTouchEnd = subscribeInput(
      view,
      'touchend',
      event => {
        if (touchIdentifier != null && !endsTouch(event, touchIdentifier)) {
          // Another finger lifted: its touchend and its click are its own.
          return;
        }
        stopTouchEnd();
        // A touchend that the browser took for a scroll is not cancelable.
        // The guard stays armed for a click that may follow it.
        if (event.cancelable) {
          event.preventDefault();
          // No click follows a cancelled touchend.
          disarmClickGuard(doc);
        }
      },
      {cancels: true},
    );
    guard.unsubscribers.push(stopTouchEnd);
  }
  guard.timer = setTimeout(() => disarmClickGuard(doc), CLICK_GUARD_WINDOW_MS);
}

/**
 * Whether `event` ends the touch `identifier`. A `touchend` that lists no
 * changed touches counts as that touch's own.
 */
function endsTouch(event: Event, identifier: number): boolean {
  const changed = (event as Partial<TouchEvent>).changedTouches;
  if (changed == null) {
    return true;
  }
  return Array.from(changed).some(touch => touch.identifier === identifier);
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
  guardState.unguardedDepth++;
  try {
    return dispatch();
  } finally {
    guardState.unguardedDepth--;
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

/** Swallows a claimed touch's late `mousedown` or `mouseup`. */
function swallowLateMouse(event: MouseEvent): void {
  if (isExempt(event)) {
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
}

function isExempt(event: MouseEvent): boolean {
  if (event.detail === 0 || guardState.unguardedDepth > 0) {
    return true;
  }
  return isHapticSwitch(event.target);
}
