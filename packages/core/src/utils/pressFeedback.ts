// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pressFeedback.ts
 * @input The press state machine (pressGesture.ts) and the document's pointer,
 *   scroll and visibility events
 * @output Exports PRESSABLE_ATTRIBUTE, PRESSED_ATTRIBUTE, pressableProps and
 *   installPressFeedback
 * @position The DOM half of the touch press model: one delegated controller
 *   per document that writes `data-astryx-press` on the nearest pressable surface.
 *   Installed by usePressFeedback (hooks/usePressFeedback.ts) on first mount;
 *   the CSS arms that read the attribute live in interactionOverlay.stylex.ts
 *   and in each component with its own `:active` rule. Tested by
 *   pressFeedback.test.ts.
 *
 * ONE listener set for every pressable surface in the document.
 *
 * Why a delegated document-level controller and not a hook on the element: a
 * virtualized list can carry more than a thousand rows, and four listeners
 * plus a state hook per row is not a cost a list like that can pay. This is
 * six listeners for the whole document, and a press costs one attribute write
 * on one element: no React render, no subscription, no per-element anything.
 * It also makes the behaviour uniform for free: every component that paints a
 * press carries {@link PRESSABLE_ATTRIBUTE}, so all of them change together.
 *
 * Under a mouse the controller does nothing and CSS `:active` keeps the press,
 * as it always has. Under a finger the `:active` arm is dropped by the CSS
 * (`@media (pointer: coarse)`) and this writes `data-astryx-press="on"` when the
 * press is believed and `data-astryx-press="fading"` for the release's exit.
 *
 * While a finger or a pen is down on a surface, its text selection and the
 * touch callout are off (gestures/selectionLock.ts, shared with the gesture
 * host), as on UIKit's controls and cells; a mouse never takes the lock.
 *
 * SYNC: When modified, update pressGesture.ts, hooks/usePressFeedback.ts,
 * utils/interactionOverlay.stylex.ts, gestures/selectionLock.ts and
 * pressFeedback.test.ts.
 */

import type {PressGesture, PressPaint, PressStep} from './pressGesture';
import {
  idlePressGesture,
  PRESS_FADE_MS,
  PRESS_FLASH_MS,
  PRESS_ONSET_MS,
  PRESS_SCROLL_BRAKE_MS,
  pressGestureStep,
} from './pressGesture';
import {lockSelection} from '../gestures/selectionLock';

/**
 * The marker the controller finds with `closest()`. Every Astryx component
 * that paints a press carries it on the element that paints; a local
 * component can opt in by spreading {@link pressableProps} (or calling
 * `usePressFeedback`) on its own pressable element and reading
 * {@link PRESSED_ATTRIBUTE} in its styles.
 */
export const PRESSABLE_ATTRIBUTE = 'data-astryx-pressable';

/** `on` while the press is believed and the finger is down; `fading` for the release's exit. */
export const PRESSED_ATTRIBUTE = 'data-astryx-press';

/** Spread onto the element that paints the press. */
export const pressableProps: {readonly [PRESSABLE_ATTRIBUTE]: ''} = {
  [PRESSABLE_ATTRIBUTE]: '',
};

/**
 * How long after a touch a scroll can still be that finger's momentum.
 *
 * iOS momentum runs for a second or two after the lift; past this window a
 * scroll is the program moving something, not a list still gliding.
 */
export const PRESS_GESTURE_MEMORY_MS = 3000;

/** A surface that is not enabled does not press, however it is touched. */
const DISABLED = ':disabled, [aria-disabled="true"]';

interface LiveGesture {
  element: HTMLElement;
  gesture: PressGesture;
  /** The pointer this gesture belongs to; a second finger is ignored. */
  pointerId: number | null;
  timer: ReturnType<typeof setTimeout> | null;
  /** Releases the selection lock the finger holds while it is down. */
  unlock: (() => void) | null;
}

let live: LiveGesture | null = null;
/** How many callers hold the controller installed; listeners exist while > 0. */
let holders = 0;
/**
 * When a scroller last moved UNDER A FINGER OF ITS OWN, and which one.
 *
 * Only a finger-driven scroll is recorded, so the brake cannot fire for a
 * scroll the app performed itself. The test is the touch's own target: a
 * scroll is that finger's if the finger was inside the scroller that moved,
 * within {@link PRESS_GESTURE_MEMORY_MS}.
 */
let lastScrollAt = 0;
let lastScroller: Node | null = null;
/** When a finger was last on the glass, and where it landed. */
let lastTouchAt = 0;
let lastTouchTarget: Node | null = null;

const TIMER_MS: Record<NonNullable<PressStep['timer']>, number> = {
  fade: PRESS_FADE_MS,
  flash: PRESS_FLASH_MS,
  onset: PRESS_ONSET_MS,
};

const TIMER_EVENT = {
  fade: 'fadeEnd',
  flash: 'flashEnd',
  onset: 'onset',
} as const;

function paintElement(element: HTMLElement, paint: PressPaint): void {
  if (paint === 'none') {
    element.removeAttribute(PRESSED_ATTRIBUTE);
    return;
  }
  element.setAttribute(PRESSED_ATTRIBUTE, paint);
}

function clearTimer(): void {
  if (live?.timer != null) {
    clearTimeout(live.timer);
    live.timer = null;
  }
}

/**
 * Run one event through the machine and make the DOM say what it answered.
 *
 * THE TIMER RULE, and why it is not "clear, then maybe re-arm": a step that
 * returns `timer: null` WITHOUT changing phase is a pass-through, and the
 * phase it left running still owes its transition. Clearing unconditionally
 * strands three gestures, each ending with a paint on a control nobody is
 * touching, until some later touch happens to clean it up:
 *
 *  - a finger that jitters inside the slop during the 150 ms delay (which is
 *    every real finger; only a synthetic touch holds perfectly still) kills
 *    the onset timer, so the press never paints at all;
 *  - a `pointercancel` or a scroll inside a quick tap's 100 ms flash kills
 *    `flashEnd`, leaving `data-astryx-press="on"` painted indefinitely. iOS Safari
 *    delivers that cancel at `scrollend`, seconds after the tap, so it is not
 *    a corner case;
 *  - the same inside the 200 ms fade strands `data-astryx-press="fading"` and the
 *    controller's single tracking slot, holding a reference to an element a
 *    virtualized list may already have unmounted.
 */
function apply(step: PressStep): void {
  if (live == null) {
    return;
  }
  const phaseMoved = step.gesture.phase !== live.gesture.phase;
  if (step.timer != null || phaseMoved) {
    clearTimer();
  }
  live.gesture = step.gesture;
  paintElement(live.element, step.paint);
  if (step.gesture.phase === 'idle') {
    live = null;
    return;
  }
  if (step.timer != null) {
    const kind = step.timer;
    // A TIMER, never `requestAnimationFrame`: iOS throttles frame callbacks
    // while a scroll runs, so a frame-based delay would fire late, after the
    // scroll, and paint a control nobody is pressing any more.
    live.timer = setTimeout(() => {
      if (live != null) {
        live.timer = null;
      }
      apply(
        pressGestureStep(live?.gesture ?? idlePressGesture(), {
          kind: TIMER_EVENT[kind],
        }),
      );
    }, TIMER_MS[kind]);
  }
}

/**
 * The innermost pressable surface at the touch, or nothing.
 *
 * Innermost wins: a button inside a pressable row takes the press, the way a
 * button inside a native cell takes the highlight instead of the cell. A
 * disabled surface takes it and paints nothing, so a press on a disabled
 * control does not light the row around it.
 */
function surfaceAt(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) {
    return null;
  }
  const found = target.closest(`[${PRESSABLE_ATTRIBUTE}]`);
  if (!(found instanceof HTMLElement) || found.matches(DISABLED)) {
    return null;
  }
  return found;
}

/**
 * Is this touch a BRAKE on a list the finger set moving, rather than a press?
 *
 * A native list highlights nothing for one, and nothing else would cancel it:
 * stopping the scroll is exactly what makes the scroll events stop arriving,
 * so there is no later signal to react to.
 *
 * Two narrowings, because "a scroll happened recently" is far too broad and
 * would swallow presses nobody asked it to. Apps scroll things by themselves
 * all the time: a transcript pinned to the bottom scrolls on every streamed
 * frame, keyboard navigation calls `scrollIntoView`, a route change restores
 * a position. None of those is a finger braking anything.
 *
 *  1. The scroller must CONTAIN the pressed element. A pane scrolling itself
 *     says nothing about a control elsewhere.
 *  2. The scroll must have been driven by a finger IN THAT SCROLLER, which is
 *     what `onScroll` records. "Any finger anywhere, recently" is not enough:
 *     tap a control, then within the memory window press a button inside a
 *     pane that is scrolling on its own, and that press would be swallowed by
 *     a scroll no finger drove.
 */
function scrollerIsBraking(element: HTMLElement): boolean {
  if (Date.now() - lastScrollAt >= PRESS_SCROLL_BRAKE_MS) {
    return false;
  }
  return lastScroller instanceof Node && lastScroller.contains(element);
}

/**
 * Let go of the controller's one tracking slot once the gesture is over.
 *
 * A gesture that became a scroll ends in `pointercancel`, not `pointerup`, so
 * without this the dead gesture holds the slot for ever and every press after
 * the first scroll is swallowed.
 */
function releaseIfDead(): void {
  if (live?.gesture.phase === 'dead') {
    clearTimer();
    unlockLive();
    live = null;
  }
}

/** The finger is up or gone: text selection comes back. */
function unlockLive(): void {
  live?.unlock?.();
  if (live != null) {
    live.unlock = null;
  }
}

/** Drop the paint and forget the gesture, without running the machine. */
function finish(): void {
  if (live == null) {
    return;
  }
  clearTimer();
  unlockLive();
  live.element.removeAttribute(PRESSED_ATTRIBUTE);
  live = null;
}

function onPointerDown(event: PointerEvent): void {
  // A mouse already has hover and keeps `:active`; the treatment's CSS is
  // inside `@media (pointer: coarse)`. Not tracking it keeps desktop identical
  // and costs the mouse path nothing.
  if (event.pointerType === 'mouse') {
    return;
  }
  if (live != null) {
    const fingerIsUp =
      live.gesture.phase === 'fading' || live.gesture.phase === 'flash';
    // A finger still down means a SECOND finger: a pinch or a two-finger
    // scroll is not a press, so the first gesture ends and the second paints
    // nothing.
    if (!fingerIsUp) {
      finish();
      return;
    }
    // A finger already up means the last tap is still fading. The new touch
    // owns the surface from here; swallowing it would make the second of two
    // quick taps answer with nothing.
    finish();
  }
  const element = surfaceAt(event.target);
  // The touch clock is stamped AFTER the brake reads it, deliberately: the
  // question the brake asks is whether a PREVIOUS finger could still be
  // driving this scroll, and stamping first would make every first touch on a
  // freshly restored page answer yes.
  const braking = element != null && scrollerIsBraking(element);
  lastTouchAt = Date.now();
  lastTouchTarget = event.target instanceof Node ? event.target : null;
  if (element == null || braking) {
    return;
  }
  live = {
    element,
    gesture: idlePressGesture(),
    pointerId: event.pointerId,
    timer: null,
    // A held finger never starts text selection on the surface (UIKit's
    // controls and cells never do), on any coarse pointer.
    unlock: lockSelection([element], event.target),
  };
  apply(
    pressGestureStep(live.gesture, {
      kind: 'down',
      x: event.clientX,
      y: event.clientY,
    }),
  );
}

function onPointerMove(event: PointerEvent): void {
  if (
    live == null ||
    (live.pointerId != null && event.pointerId !== live.pointerId)
  ) {
    return;
  }
  apply(
    pressGestureStep(live.gesture, {
      kind: 'move',
      x: event.clientX,
      y: event.clientY,
    }),
  );
}

function onPointerUp(event: PointerEvent): void {
  // The mouse exclusion applies to the brake's clocks too, not only to the
  // paint: a mouse release inside a scroller would make the next wheel or
  // programmatic scroll there look finger-driven, which swallows a real touch
  // press landing inside the brake window. A coarse pointer and a mouse can
  // both be present on one device.
  if (event.pointerType === 'mouse') {
    return;
  }
  // The lift is when momentum starts, so it is the clock the brake wants most.
  lastTouchAt = Date.now();
  if (event.target instanceof Node) {
    lastTouchTarget = event.target;
  }
  if (
    live == null ||
    (live.pointerId != null && event.pointerId !== live.pointerId)
  ) {
    return;
  }
  unlockLive();
  apply(pressGestureStep(live.gesture, {kind: 'up'}));
  releaseIfDead();
}

/**
 * The scroller claimed the gesture, or the platform took it.
 *
 * `pointercancel` is the primary one: measured on iOS 26.2 it fires before
 * the first `scroll` event (+303 ms against +304 ms on a slow drag, +31 ms
 * against +47 ms on a fling), which is what puts this cancel one frame ahead
 * of the list's motion, the way UIKit's `touchesCancelled` is.
 */
function onCancel(): void {
  if (live == null) {
    return;
  }
  unlockLive();
  apply(pressGestureStep(live.gesture, {kind: 'cancel'}));
  // The pointer is gone: a scroll-claimed gesture sends no further pointer
  // events, so nothing else would ever free the slot.
  releaseIfDead();
}

/** A scroll anywhere above the pressed element, caught in the capture phase. */
function onScroll(event: Event): void {
  const scroller = event.target instanceof Node ? event.target : document;
  // A scroll counts as a finger's only if that finger was inside THIS
  // scroller, recently. Anything else is the program moving something, and
  // must leave the brake unarmed rather than merely un-refreshed.
  const driven =
    Date.now() - lastTouchAt < PRESS_GESTURE_MEMORY_MS &&
    lastTouchTarget != null &&
    scroller.contains(lastTouchTarget);
  if (driven) {
    lastScrollAt = Date.now();
    lastScroller = scroller;
  }
  if (live == null) {
    return;
  }
  // The CANCEL arm is deliberately wider than the brake: any scroll above the
  // pressed element takes the gesture, driven by a finger or not.
  const reaches = scroller === document || scroller.contains(live.element);
  if (!reaches) {
    return;
  }
  onCancel();
}

/**
 * The backstop: a surface that leaves the document while it is painted must
 * not come back painted. A virtualized list mounts and unmounts rows as they
 * cross the scrollport, and React re-uses elements; the scroll cancel already
 * makes that unreachable while a press is live, because recycling needs a
 * scroll.
 */
function onVisibilityChange(): void {
  if (document.visibilityState === 'hidden') {
    finish();
  }
}

const PASSIVE_CAPTURE = {capture: true, passive: true} as const;

function addListeners(): void {
  window.addEventListener('pointerdown', onPointerDown, PASSIVE_CAPTURE);
  window.addEventListener('pointermove', onPointerMove, PASSIVE_CAPTURE);
  window.addEventListener('pointerup', onPointerUp, PASSIVE_CAPTURE);
  window.addEventListener('pointercancel', onCancel, PASSIVE_CAPTURE);
  window.addEventListener('touchcancel', onCancel, PASSIVE_CAPTURE);
  // `dragstart`, and NOT `contextmenu`: a long press that becomes a drag has
  // taken the gesture, but a right-click is a mouse act this controller never
  // tracks, and listening for it would read as a takeover of the browser's
  // own menu.
  window.addEventListener('dragstart', onCancel, PASSIVE_CAPTURE);
  // `scroll` does not bubble, so the capture phase is the only way one
  // listener hears every scroller in the document.
  document.addEventListener('scroll', onScroll, PASSIVE_CAPTURE);
  document.addEventListener('visibilitychange', onVisibilityChange);
}

function removeListeners(): void {
  window.removeEventListener('pointerdown', onPointerDown, PASSIVE_CAPTURE);
  window.removeEventListener('pointermove', onPointerMove, PASSIVE_CAPTURE);
  window.removeEventListener('pointerup', onPointerUp, PASSIVE_CAPTURE);
  window.removeEventListener('pointercancel', onCancel, PASSIVE_CAPTURE);
  window.removeEventListener('touchcancel', onCancel, PASSIVE_CAPTURE);
  window.removeEventListener('dragstart', onCancel, PASSIVE_CAPTURE);
  document.removeEventListener('scroll', onScroll, PASSIVE_CAPTURE);
  document.removeEventListener('visibilitychange', onVisibilityChange);
}

/**
 * Install the touch press controller on this document, once, however many
 * times it is called: the listeners exist while at least one caller holds it.
 *
 * Every Astryx pressable calls this through `usePressFeedback` on mount, so
 * an app needs no wiring; call it directly from module scope when a page has
 * pressable surfaces of its own and no Astryx component on it.
 *
 * @returns A release function. Call it once per install; the listeners come
 *   down when the last holder releases, and the paint and the brake's clocks
 *   are reset with them, so a later install never inherits a gesture that
 *   never happened.
 */
/**
 * Whether the touch press controller is installed: the delegated press of
 * gestures/delegatedPress.ts stays off the same attribute while it is.
 */
export function isPressFeedbackInstalled(): boolean {
  return holders > 0;
}

export function installPressFeedback(): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }
  if (holders === 0) {
    addListeners();
  }
  holders += 1;
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    holders -= 1;
    if (holders > 0) {
      return;
    }
    removeListeners();
    finish();
    lastScrollAt = 0;
    lastScroller = null;
    lastTouchAt = 0;
    lastTouchTarget = null;
  };
}
