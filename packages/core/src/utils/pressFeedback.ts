// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pressFeedback.ts
 * @input The press state machine (pressGesture.ts) and the document's pointer,
 *   keyboard, scroll and visibility events
 * @output Exports paintPress and readPressPaint (the press attribute's
 *   writer for every press they track), PRESSABLE_ATTRIBUTE,
 *   PRESSED_ATTRIBUTE, pressableProps and installPressFeedback
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
 * a handful of listeners for the whole document, and a press costs one
 * attribute write on one element: no React render, no subscription, no
 * per-element anything. It also makes the behaviour uniform for free: every
 * component that paints a press carries {@link PRESSABLE_ATTRIBUTE}, so all of
 * them change together.
 *
 * Where the primary pointer is fine (a desktop), the controller ignores the
 * mouse and the keyboard: CSS `:active` keeps their press, as it always has,
 * and the mouse path costs nothing. Under a finger the `:active` arm is
 * dropped by the CSS (`@media (pointer: coarse)`) and this writes
 * `data-astryx-press="on"` when the press is believed and
 * `data-astryx-press="fading"` for the release's exit.
 *
 * That query reads the PRIMARY pointer, so on a phone or a tablet the
 * stylesheet drops `:active` for every press, including a mouse or trackpad
 * click and a Space press on a focused button. There, the controller paints
 * those too: at once (no scroller can claim a mouse button or a key, so
 * nothing waits), held while the button or key is down, and faded at the
 * release, the way a finger's press leaves. The query is the stylesheet's
 * own, so the two cannot disagree about which presses are the controller's.
 *
 * A surface's hold does nothing, so it keeps the browser's long-press text
 * selection (`spec:AST-094` FR41); only an element whose hold does something
 * suppresses it, through the gesture host (utils/selectionLock.ts).
 *
 * Its one touch-only listener, `touchcancel`, is on only while the primary
 * pointer is coarse (coarsePointer.ts, `spec:AST-094` FR24).
 *
 * SYNC: When modified, update pressGesture.ts, hooks/usePressFeedback.ts,
 * hooks/usePressFeedback.doc.mjs, utils/interactionOverlay.stylex.ts and
 * pressFeedback.test.ts.
 */

import type {
  PressGesture,
  PressPaint as GesturePaint,
  PressStep,
} from './pressGesture';
import {
  idlePressGesture,
  PRESS_FADE_MS,
  PRESS_FLASH_MS,
  PRESS_ONSET_MS,
  PRESS_SCROLL_BRAKE_MS,
  pressGestureStep,
} from './pressGesture';
import {isCoarsePointer, watchCoarsePointer} from './coarsePointer';
import {subscribeInput} from './inputStream';
import {TOUCH_QUERY} from './touchPresentation';
import {timing} from '../motion/uikit/timing';

/**
 * The marker the controller finds with `closest()`. Every Astryx component
 * that paints a press carries it on the element that paints; a local
 * component can opt in by spreading {@link pressableProps} (or calling
 * `usePressFeedback`) on its own pressable element and reading
 * {@link PRESSED_ATTRIBUTE} in its styles.
 */
export const PRESSABLE_ATTRIBUTE = 'data-astryx-pressable';

/**
 * `on` while the press is believed and the finger (or, where the controller
 * paints them, the mouse button or Space key) is down; `fading` for the
 * release's exit.
 */
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

/**
 * The `<input>` types a Space press activates as a button. Browsers hold
 * `:active` on these (and on `<button>`) while Space is down; on a link or a
 * `role="button"` element Space does nothing, so neither paints there. A
 * checkbox or radio is left out: its pressable surface is the row around it,
 * and desktop Chromium and WebKit leave that row at rest for a Space press
 * (only the input matches `:active`), so it paints nothing here either.
 */
const SPACE_ACTIVATED_INPUT_TYPES: ReadonlySet<string> = new Set([
  'button',
  'image',
  'reset',
  'submit',
]);

/**
 * A menu's own highlight is its only paint (`module:DropdownMenu/useMenuPress`
 * FR6, DEC-6): a press held on one row while the highlight follows the
 * pointer to another would light two rows.
 */
const MENU_PRESS_ROOT = '[data-astryx-menu-press]';

interface LiveGesture {
  element: HTMLElement;
  gesture: PressGesture;
  /**
   * The pointer this gesture belongs to; a second finger is ignored. `null`
   * for a press of the Space key.
   */
  pointerId: number | null;
  /** Cancels the clock the current phase owes, or the release it waits for. */
  timer: (() => void) | null;
}

/**
 * One tracking slot. A finger's press runs the whole machine (the delay, the
 * slop, the scroll that takes it away). A mouse button's or the Space key's
 * press is believed at once and only waits for its release, so it has a slot
 * of its own: a finger landing never ends it, and it never swallows a
 * finger's press.
 */
interface Slot {
  live: LiveGesture | null;
}

const finger: Slot = {live: null};
const button: Slot = {live: null};
/** How many callers hold the controller installed; listeners exist while > 0. */
let holders = 0;
/** Whether the stylesheet left mouse and keyboard presses to the controller; read at the first one. */
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

/**
 * How long a timer runs on `element`. The release's clock is the table's
 * (PRESS_FADE_MS, the value the stylesheet's release plays), capped under
 * reduced motion by the Reduce Motion cross-fade's duration, as the
 * stylesheet caps its fade (`design:reduced-motion` DR2: a touch transition
 * finishes within it; `spec:AST-094` FR4: the cap is a role, never a
 * literal).
 */
function timerMs(
  kind: NonNullable<PressStep['timer']>,
  element: Element,
): number {
  if (kind !== 'fade') {
    return TIMER_MS[kind];
  }
  const reduced =
    element.ownerDocument.defaultView?.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches ?? false;
  return reduced
    ? Math.min(TIMER_MS.fade, timing.reducedMotionCrossFadeMs)
    : TIMER_MS.fade;
}

const TIMER_EVENT = {
  fade: 'fadeEnd',
  flash: 'flashEnd',
  onset: 'onset',
} as const;

/** The press attribute's states: on, held, fading on its release, none. */
export type PressPaint = 'on' | 'held' | 'fading' | 'none';

export interface PaintPressOptions {
  /**
   * The release's clock, ms: when it runs out, the controller checks for the
   * release animation, and `fading` stays until that animation ends (or goes
   * then, where none runs). @default the press fade
   */
  releaseMs?: number;
  /** The current values this write may replace. @default none, on, fading */
  onlyFrom?: ReadonlyArray<PressPaint>;
}

/** What a press may replace: a `held` row is its owner's until released. */
const PRESS_REPLACES: ReadonlyArray<PressPaint> = ['none', 'on', 'fading'];
const PAINTS: ReadonlySet<string> = new Set(['on', 'held', 'fading']);
/** Cancels a `fading` paint's own release, per element (paintPress). */
const fadeTimers = new WeakMap<Element, () => void>();

/**
 * The release animations running on `element`: its own CSS animations (on
 * it, or its `::before` or `::after`, never a descendant's), finite, and not
 * yet finished. Nothing at the write reads the document timeline: WebKit
 * starts an animation created after such a read at the time read, so a busy
 * first frame would skip into the release. Empty where the engine has no Web
 * Animations.
 */
function releaseAnimationsOf(element: Element): Animation[] {
  if (typeof element.getAnimations !== 'function') {
    return [];
  }
  return element.getAnimations({subtree: true}).filter(animation => {
    // A CSS animation's effect is a KeyframeEffect: its target is the
    // element it runs on, or the element whose pseudo-element it runs on.
    const effect = animation.effect as KeyframeEffect | null;
    if (!('animationName' in animation) || effect?.target !== element) {
      return false;
    }
    if (!Number.isFinite(Number(effect.getComputedTiming().endTime))) {
      return false;
    }
    return animation.playState !== 'finished';
  });
}

/**
 * Call `end` when the release a `fading` write just started on `element` is
 * over: when the stylesheet's release animation ends, not when a clock runs
 * out. A busy main thread delays the animation's first frame, and with it
 * its end, so a clock started at the write would remove `fading` mid-fade
 * and cut the release short. The clock only looks: `clockMs` after the
 * write, a release animation still running, or still waiting for its first
 * frame, is waited for until it finishes or is cancelled (the surface was
 * unmounted or restyled); with none (an instant release, a surface without
 * a release animation, an engine without Web Animations) the release ends
 * there. Returns a cancel.
 */
function endAfterRelease(
  element: Element,
  clockMs: number,
  end: () => void,
): () => void {
  let waiting = true;
  const timer = setTimeout(() => {
    const running = releaseAnimationsOf(element);
    if (running.length === 0) {
      end();
      return;
    }
    void Promise.allSettled(
      running.map(async animation => animation.finished),
    ).then(() => {
      if (waiting) {
        end();
      }
    });
  }, clockMs);
  return () => {
    waiting = false;
    clearTimeout(timer);
  };
}

/** The press state painted on `element` now; `null` for a value no painter wrote. */
export function readPressPaint(element: Element): PressPaint | null {
  const value = element.getAttribute(PRESSED_ATTRIBUTE);
  if (value == null) {
    return 'none';
  }
  return PAINTS.has(value) ? (value as PressPaint) : null;
}

/**
 * Write `next` on `element` if its state is one of `onlyFrom`: the press
 * attribute's writer for the controller and every painter that uses
 * paintPress, so a fade's clock and the attribute never drift apart (the
 * action-group tracker, hooks/actionGroupTracker.ts, still writes its groups'
 * presses itself). Any write ends a fade paintPress left running there.
 * Returns whether it wrote.
 */
function writePress(
  element: Element,
  next: PressPaint,
  onlyFrom: ReadonlyArray<PressPaint> = PRESS_REPLACES,
): boolean {
  const current = readPressPaint(element);
  if (current == null || !onlyFrom.includes(current)) {
    return false;
  }
  const pending = fadeTimers.get(element);
  if (pending != null) {
    pending();
    fadeTimers.delete(element);
  }
  if (next === 'none') {
    element.removeAttribute(PRESSED_ATTRIBUTE);
  } else if (current !== next) {
    element.setAttribute(PRESSED_ATTRIBUTE, next);
  }
  return true;
}

/**
 * Paint `next` on `element` if its current press state is in `onlyFrom`
 * (by default none, on or fading: a hold survives a press, and its owner
 * releases it with `onlyFrom: ['held']`). A `fading` paint ends when its
 * release animation does, or on its own clock where none runs
 * (endAfterRelease). Returns whether it painted. For a painter other than the touch
 * press controller: a group that tracks its selection, a row that keeps its
 * selection through a navigation.
 */
export function paintPress(
  element: Element,
  next: PressPaint,
  options: PaintPressOptions = {},
): boolean {
  if (!writePress(element, next, options.onlyFrom)) {
    return false;
  }
  if (next === 'fading') {
    fadeTimers.set(
      element,
      endAfterRelease(element, options.releaseMs ?? PRESS_FADE_MS, () => {
        fadeTimers.delete(element);
        if (element.getAttribute(PRESSED_ATTRIBUTE) === 'fading') {
          element.removeAttribute(PRESSED_ATTRIBUTE);
        }
      }),
    );
  }
  return true;
}

/**
 * The controller's paint, through writePress: a state the controller did
 * not write is its owner's (a `held` row), so neither a new press nor a
 * release's end overwrites or clears it.
 */
function paintElement(element: HTMLElement, paint: GesturePaint): void {
  writePress(element, paint);
}

function clearTimer(slot: Slot): void {
  if (slot.live?.timer != null) {
    slot.live.timer();
    slot.live.timer = null;
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
function apply(slot: Slot, step: PressStep): void {
  const live = slot.live;
  if (live == null) {
    return;
  }
  const phaseMoved = step.gesture.phase !== live.gesture.phase;
  if (step.timer != null || phaseMoved) {
    clearTimer(slot);
  }
  live.gesture = step.gesture;
  paintElement(live.element, step.paint);
  if (step.gesture.phase === 'idle') {
    slot.live = null;
    return;
  }
  if (step.timer != null) {
    const kind = step.timer;
    const fire = () => {
      if (slot.live != null) {
        slot.live.timer = null;
      }
      apply(
        slot,
        pressGestureStep(slot.live?.gesture ?? idlePressGesture(), {
          kind: TIMER_EVENT[kind],
        }),
      );
    };
    if (kind === 'fade') {
      // The release is over when its animation is, however late a busy
      // main thread let that animation start.
      live.timer = endAfterRelease(
        live.element,
        timerMs(kind, live.element),
        fire,
      );
    } else {
      // A TIMER, never `requestAnimationFrame`: iOS throttles frame callbacks
      // while a scroll runs, so a frame-based delay would fire late, after the
      // scroll, and paint a control nobody is pressing any more.
      const timer = setTimeout(fire, timerMs(kind, live.element));
      live.timer = () => clearTimeout(timer);
    }
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
 * Let go of a slot once its gesture is over.
 *
 * A gesture that became a scroll ends in `pointercancel`, not `pointerup`, so
 * without this the dead gesture holds the slot for ever and every press after
 * the first scroll is swallowed.
 */
function releaseIfDead(slot: Slot): void {
  if (slot.live?.gesture.phase === 'dead') {
    clearTimer(slot);
    slot.live = null;
  }
}

/** Drop the paint and forget the gesture, without running the machine. */
function finish(slot: Slot): void {
  const live = slot.live;
  if (live == null) {
    return;
  }
  clearTimer(slot);
  writePress(live.element, 'none');
  slot.live = null;
  if (slot === button) {
    holdKey(false);
  }
}

/** A new press on an element owns its paint: the other slot's gesture there ends. */
function takeOver(other: Slot, element: HTMLElement): void {
  if (other.live?.element === element) {
    finish(other);
  }
}

/**
 * Whether presses with a mouse or a key are the controller's to paint here.
 * Asked at each such press: rendering a pressable never queries the pointer,
 * so a layout that must not depend on it stays independent.
 */
function stylesheetDroppedActive(): boolean {
  // The shared touch resolver's key (`spec:AST-012` FR2): the condition the
  // stylesheet drops `:active` under (`COARSE` in
  // interactionOverlay.stylex.ts), read once per press.
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia(TOUCH_QUERY).matches
  );
}

/**
 * The surface a mouse button's or the Space key's press paints, if any: the
 * innermost marked surface, outside a menu. A key's press paints only a
 * focused element that is itself the surface, as `:active` does.
 */
function buttonSurfaceAt(
  target: EventTarget | null,
  pointerId: number | null,
): HTMLElement | null {
  const element = surfaceAt(target);
  if (element == null || element.closest(MENU_PRESS_ROOT) != null) {
    return null;
  }
  if (pointerId == null && element !== target) {
    return null;
  }
  return element;
}

/** Start a mouse button's or the Space key's press on the surface, if there is one. */
function pressButton(
  target: EventTarget | null,
  pointerId: number | null,
): void {
  // A press still fading elsewhere goes now: the new one owns the slot.
  finish(button);
  const element = buttonSurfaceAt(target, pointerId);
  if (element == null) {
    return;
  }
  takeOver(finger, element);
  button.live = {element, gesture: idlePressGesture(), pointerId, timer: null};
  holdKey(pointerId == null);
  apply(button, pressGestureStep(button.live.gesture, {kind: 'buttonDown'}));
}

/** The mouse button or the key came up: the press fades like a finger's. */
function releaseButton(): void {
  holdKey(false);
  if (button.live == null) {
    return;
  }
  apply(button, pressGestureStep(button.live.gesture, {kind: 'up'}));
}

/** The platform took the mouse's press away: the paint goes at once. */
function cancelButton(): void {
  holdKey(false);
  if (button.live == null) {
    return;
  }
  apply(button, pressGestureStep(button.live.gesture, {kind: 'cancel'}));
  releaseIfDead(button);
}

function onPointerDown(event: PointerEvent): void {
  if (event.pointerType === 'mouse') {
    // A mouse already has hover and keeps `:active` where the primary pointer
    // is fine; the touch treatment's CSS is inside `@media (pointer: coarse)`.
    // Not tracking it there keeps desktop identical and costs the mouse path
    // nothing. Only the primary button: that is the press `:active` paints.
    if (event.button === 0 && stylesheetDroppedActive()) {
      pressButton(event.target, event.pointerId);
    }
    return;
  }
  armTouchCancel();
  if (finger.live != null) {
    const fingerIsUp =
      finger.live.gesture.phase === 'fading' ||
      finger.live.gesture.phase === 'flash';
    // A finger still down means a SECOND finger: a pinch or a two-finger
    // scroll is not a press, so the first gesture ends and the second paints
    // nothing.
    if (!fingerIsUp) {
      finish(finger);
      return;
    }
    // A finger already up means the last tap is still fading. The new touch
    // owns the surface from here; swallowing it would make the second of two
    // quick taps answer with nothing.
    finish(finger);
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
  takeOver(button, element);
  finger.live = {
    element,
    gesture: idlePressGesture(),
    pointerId: event.pointerId,
    timer: null,
  };
  apply(
    finger,
    pressGestureStep(finger.live.gesture, {
      kind: 'down',
      x: event.clientX,
      y: event.clientY,
    }),
  );
}

function onPointerMove(event: PointerEvent): void {
  const live = finger.live;
  if (
    live == null ||
    (live.pointerId != null && event.pointerId !== live.pointerId)
  ) {
    return;
  }
  apply(
    finger,
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
    if (button.live != null && button.live.pointerId === event.pointerId) {
      releaseButton();
    }
    return;
  }
  // The lift is when momentum starts, so it is the clock the brake wants most.
  lastTouchAt = Date.now();
  if (event.target instanceof Node) {
    lastTouchTarget = event.target;
  }
  const live = finger.live;
  if (
    live == null ||
    (live.pointerId != null && event.pointerId !== live.pointerId)
  ) {
    return;
  }
  apply(finger, pressGestureStep(live.gesture, {kind: 'up'}));
  releaseIfDead(finger);
}

/**
 * The scroller claimed the gesture, or the platform took it.
 *
 * `pointercancel` is the primary one: measured on iOS 26.2 it fires before
 * the first `scroll` event (+303 ms against +304 ms on a slow drag, +31 ms
 * against +47 ms on a fling), which is what puts this cancel one frame ahead
 * of the list's motion, the way UIKit's `touchesCancelled` is.
 */
function onCancel(event?: Event): void {
  // A cancelled mouse pointer ends the mouse's press, not a finger's.
  const pointer = event as Partial<PointerEvent> | undefined;
  if (pointer?.pointerType === 'mouse') {
    if (button.live != null && button.live.pointerId === pointer.pointerId) {
      cancelButton();
    }
    return;
  }
  const live = finger.live;
  if (live == null) {
    return;
  }
  apply(finger, pressGestureStep(live.gesture, {kind: 'cancel'}));
  // The pointer is gone: a scroll-claimed gesture sends no further pointer
  // events, so nothing else would ever free the slot.
  releaseIfDead(finger);
}

/**
 * `dragstart`, and NOT `contextmenu`: a press that becomes a drag has taken
 * the gesture, whatever pressed it, but a right-click is a mouse act this
 * controller never tracks, and listening for it would read as a takeover of
 * the browser's own menu.
 */
function onDragStart(): void {
  onCancel();
  cancelButton();
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
  const live = finger.live;
  if (live == null) {
    return;
  }
  // The CANCEL arm is deliberately wider than the brake: any scroll above the
  // pressed element takes the gesture, driven by a finger or not. A mouse's
  // or a key's press is not a finger's and keeps going, as `:active` does.
  const reaches = scroller === document || scroller.contains(live.element);
  if (!reaches) {
    return;
  }
  onCancel();
}

/** Whether a Space press on this element is an activation browsers paint as `:active`. */
function activatesOnSpace(target: EventTarget | null): boolean {
  if (target instanceof HTMLButtonElement) {
    return true;
  }
  return (
    target instanceof HTMLInputElement &&
    SPACE_ACTIVATED_INPUT_TYPES.has(target.type)
  );
}

/**
 * Space went down on a focused button that is itself a pressable surface.
 * Heard in the BUBBLE phase, after the page's own handlers, so a press the
 * page cancelled (`preventDefault`) paints nothing, exactly as `:active` does
 * not engage for one.
 */
function onKeyDown(event: KeyboardEvent): void {
  if (
    event.key !== ' ' ||
    event.repeat ||
    event.isComposing ||
    event.defaultPrevented ||
    !activatesOnSpace(event.target) ||
    !stylesheetDroppedActive()
  ) {
    return;
  }
  pressButton(event.target, null);
}

function onKeyUp(event: KeyboardEvent): void {
  if (
    event.key === ' ' &&
    button.live != null &&
    button.live.pointerId == null
  ) {
    releaseButton();
  }
}

/**
 * Focus left the pressed button, or the window lost focus: the key's release
 * may never arrive here, so the press ends now, with its fade.
 */
function onBlur(): void {
  if (button.live != null && button.live.pointerId == null) {
    releaseButton();
  }
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
    finish(finger);
    finish(button);
  }
}

/** The input stream subscriptions while installed. */
let unsubscribers: (() => void)[] = [];

/** The touch-only `touchcancel` subscription, while the pointer is coarse. */
let stopTouchCancel: (() => void) | null = null;
let stopWatchingPointer: (() => void) | null = null;

/**
 * The one touch-only listener is on only while the primary pointer is coarse
 * (`spec:AST-094` FR24); where it is fine, a finger's press still ends
 * through `pointercancel`.
 */
function hearTouchCancel(on: boolean): void {
  if (on === (stopTouchCancel != null)) {
    return;
  }
  if (on) {
    stopTouchCancel = subscribeInput(window, 'touchcancel', onCancel);
  } else {
    stopTouchCancel?.();
    stopTouchCancel = null;
  }
}

/**
 * Read the primary pointer when the first finger or pen lands, and follow it
 * from then on: installing asks nothing, so a page no one touches never
 * queries it.
 */
function armTouchCancel(): void {
  if (stopWatchingPointer != null) {
    return;
  }
  stopWatchingPointer = watchCoarsePointer(window, hearTouchCancel);
  hearTouchCancel(isCoarsePointer(window));
}

// The pointer, drag, scroll and visibility listeners are passive and on the
// window's capture phase, through the shared input stream
// (utils/inputStream.ts): a page of pressables blocks no scroll, and an app's
// capture-phase stopPropagation at the document cannot starve the controller.
function addListeners(): void {
  unsubscribers = [
    subscribeInput(window, 'pointerdown', onPointerDown),
    subscribeInput(window, 'pointermove', onPointerMove),
    subscribeInput(window, 'pointerup', onPointerUp),
    subscribeInput(window, 'pointercancel', onCancel),
    subscribeInput(window, 'dragstart', onDragStart),
    // `scroll` does not bubble; the capture phase hears every scroller.
    subscribeInput(window, 'scroll', onScroll),
    subscribeInput(window, 'visibilitychange', onVisibilityChange),
  ];
  // The key path listens after the page's own handlers, at the window's
  // bubble phase: a Space press the page cancels (`defaultPrevented`) paints
  // nothing. Only Space's press needs the key's release and focus loss, so
  // those two are attached while it is held (holdKey).
  window.addEventListener('keydown', onKeyDown, PASSIVE);
}

function removeListeners(): void {
  for (const unsubscribe of unsubscribers.splice(0)) {
    unsubscribe();
  }
  stopWatchingPointer?.();
  stopWatchingPointer = null;
  hearTouchCancel(false);
  window.removeEventListener('keydown', onKeyDown);
  holdKey(false);
}

const PASSIVE_CAPTURE = {capture: true, passive: true} as const;
const PASSIVE = {passive: true} as const;

/** Whether the key-release listeners are attached. */
let keyHeld = false;

/**
 * Attach the key's release and focus-loss listeners while Space holds a
 * press, and take them down when it ends: at rest the key path costs one
 * `keydown` listener.
 */
function holdKey(held: boolean): void {
  if (held === keyHeld) {
    return;
  }
  keyHeld = held;
  if (held) {
    window.addEventListener('keyup', onKeyUp, PASSIVE);
    // `blur` does not bubble: the capture phase hears the element losing
    // focus and the window losing it.
    window.addEventListener('blur', onBlur, PASSIVE_CAPTURE);
  } else {
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur, PASSIVE_CAPTURE);
  }
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
    finish(finger);
    finish(button);
    lastScrollAt = 0;
    lastScroller = null;
    lastTouchAt = 0;
    lastTouchTarget = null;
  };
}
