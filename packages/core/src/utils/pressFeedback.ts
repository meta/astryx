// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pressFeedback.ts
 * @input The press state machine (pressGesture.ts) and the document's pointer,
 *   keyboard, scroll and visibility events
 * @output Exports paintPress and readPressPaint (the one writer of the press
 *   attribute for every painter), PRESSABLE_ATTRIBUTE, PRESSED_ATTRIBUTE,
 *   PRESS_PROFILES, pressableProps, the list row's press profile
 *   (CELL_PRESS_PROFILE, cellPressableProps) and installPressFeedback
 * @position The DOM half of the touch press model: one delegated controller
 *   per document that writes `data-astryx-press` on the nearest pressable surface.
 *   Installed by usePressFeedback (hooks/usePressFeedback.ts) on first mount;
 *   the CSS arms that read the attribute live in interactionOverlay.stylex.ts
 *   and in each component with its own `:active` rule. Tested by
 *   pressFeedback.test.ts.
 *
 * ONE listener set for every pressable surface in the document.
 *
 * TWO PROFILES, chosen by the marker's value. A control (an empty marker: a
 * button, a card, a switch) is a UIControl: under a finger it highlights in
 * the frame the finger lands, unless a scroller sits above it, where it waits
 * UIScrollView's content-touch delay like everything else in a scroll view.
 * A cell (`cell`: a list or tree row) waits that delay inside a scroll view
 * and highlights at once outside one (`spec:AST-094` FR11), like a control.
 * Both are cancelled by travel past
 * the slop or by the scroll that takes the touch, and both fade at the lift
 * on their profile's clock.
 *
 * LISTENERS ONLY WHILE A PRESS IS LIVE. At rest the document carries two
 * passive listeners, `pointerdown` and `keydown`, which only arm. A touch, or
 * a mouse button or Space press the controller paints, attaches the rest
 * (move, up, cancel, the finger's lift, scroll, drag and visibility; a Space
 * press also the key's release and focus loss). They come down once no press
 * is live and no finger is down, or, when a lift leaves a fling scrolling,
 * at that scroller's `scrollend`: the brake hears the fling until then.
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
 A FINE POINTER'S PRESS, a mouse's or a pen's, goes through this controller
 * on every device (`spec:AST-094` FR11, FR43, DEC-21): it paints at once on
 * `pointerdown` (no scroller can claim it, so nothing waits and no brake
 * applies), holds while the button is down (a mouse's press, like
 * `:active`, through a drag off the surface), and fades at the release on a
 * finger's clock on that device, in place of the browser's `:active`. A
 * right click and a ctrl-click on macOS paint nothing (primaryClick.ts). A
 * finger's press writes `data-astryx-press="on"` when the press is believed
 * and `data-astryx-press="fading"` for the release's exit.
 *
 * A Space press keeps its path: where the primary pointer is fine, the
 * browser's `:active` paints it; on a phone or a tablet, where the
 * stylesheet drops `:active` (`@media (pointer: coarse)` reads the PRIMARY
 * pointer), the controller paints it, at once, held while the key is down,
 * and faded on the deselect clock. The query is the stylesheet's own, so the
 * two cannot disagree about which key presses are the controller's.
 *
 * A native control inside a surface (a link or a button in a row's
 * description) takes its own press, for every pointer: the surface stays at
 * rest.
 *
 * A surface's hold does nothing, so it keeps the browser's long-press text
 * selection (`spec:AST-094` FR41); only an element whose hold does something
 * suppresses it, through the gesture host (utils/selectionLock.ts).
 *
 * Its touch-only listeners, the finger's `touchend` and `touchcancel`, are on
 * only while a press is tracked and the primary pointer is coarse
 * (coarsePointer.ts, `spec:AST-094` FR24).
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
import {controlPressConsts} from './controlPressLayer.stylex';
import {subscribeInput} from './inputStream';
import {isPrimaryClick} from './primaryClick';
import {TOUCH_QUERY} from './touchPresentation';

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

/**
 * Marks a press the controller paints for a mouse button (`mouse`) or the
 * Space key (`key`) on a touch-first device, beside {@link PRESSED_ATTRIBUTE}:
 * its release keeps the 200 ms fade a fine pointer has, while a finger's
 * press releases on its surface's profile (`component:Button` FR15,
 * `spec:AST-094`).
 */
export const PRESS_INPUT_ATTRIBUTE = 'data-astryx-press-input';

/** Spread onto the element that paints the press: a control. */
export const pressableProps: {readonly [PRESSABLE_ATTRIBUTE]: ''} = {
  [PRESSABLE_ATTRIBUTE]: '',
};

/** How a surface's press behaves under a finger. */
export interface PressProfile {
  /**
   * When the highlight waits UIScrollView's content-touch delay
   * (`PRESS_ONSET_MS`): only inside a scroller (a control and a cell,
   * `spec:AST-094` FR11), or always.
   */
  readonly highlightDelay: 'inScrollers' | 'always';
  /** How long the release's exit runs, in ms: the attribute leaves after it. */
  readonly releaseMs: number;
}

/**
 * The press profile a list row carries in its {@link PRESSABLE_ATTRIBUTE}
 * marker: rows paint the press on the cell layer (interactionOverlay.stylex.ts
 * `cell`) and release on the cell's clock; a selection hold finds rows by it.
 */
export const CELL_PRESS_PROFILE = 'cell';

/**
 * Spread on a list row's pressable element after the press feedback hook's
 * props: the marker carries the cell profile.
 */
export const cellPressableProps: {
  readonly [PRESSABLE_ATTRIBUTE]: typeof CELL_PRESS_PROFILE;
} = {[PRESSABLE_ATTRIBUTE]: CELL_PRESS_PROFILE};

/**
 * The two press profiles, selected by the marker's value: empty for a
 * control, {@link CELL_PRESS_PROFILE} for a row.
 */
export const PRESS_PROFILES = {
  /**
   * UIControl: highlighted in the frame the finger lands, outside scrollers,
   * and released on UIButton's clock (the stylesheet's own constant) under
   * a coarse primary pointer (see `releaseOf`).
   */
  control: {
    highlightDelay: 'inScrollers',
    releaseMs: controlPressConsts.controlReleaseMs,
  },
  /** A table or collection cell: waits only inside a scroll view (FR11). */
  cell: {highlightDelay: 'inScrollers', releaseMs: PRESS_FADE_MS},
} as const satisfies Readonly<Record<string, PressProfile>>;

export type PressProfileName = keyof typeof PRESS_PROFILES;

/** The profile a surface's marker selects. */
function profileOf(element: HTMLElement): PressProfile {
  return element.getAttribute(PRESSABLE_ATTRIBUTE) === CELL_PRESS_PROFILE
    ? PRESS_PROFILES.cell
    : PRESS_PROFILES.control;
}

/** Overflow values that let a box scroll, and how far it must overflow to. */
const SCROLLABLE: ReadonlySet<string> = new Set(['auto', 'scroll', 'overlay']);
const OVERFLOW_TOLERANCE_PX = 1;

/** The root scrolls unless it or the body clips it (as a scroll lock does). */
function rootScrolls(doc: Document, axis: 'x' | 'y'): boolean {
  const view = doc.defaultView;
  if (view == null) {
    return false;
  }
  for (const element of [doc.documentElement, doc.body]) {
    if (element == null) {
      continue;
    }
    const style = view.getComputedStyle(element);
    const value = axis === 'x' ? style.overflowX : style.overflowY;
    if (value === 'hidden' || value === 'clip') {
      return false;
    }
  }
  return true;
}

/** Which pans `touch-action` leaves the browser on this element. */
function allowedPans(value: string): {x: boolean; y: boolean} {
  const tokens = value.trim().split(/\s+/);
  if (tokens.includes('auto') || tokens.includes('manipulation')) {
    return {x: true, y: true};
  }
  if (tokens.includes('none')) {
    return {x: false, y: false};
  }
  return {
    x: tokens.some(token => /^pan-(x|left|right)$/.test(token)),
    y: tokens.some(token => /^pan-(y|up|down)$/.test(token)),
  };
}

/**
 * Whether the browser could scroll something under this element: a box above
 * it (the page included) that overflows on an axis it scrolls and that
 * `touch-action` leaves to the browser. That is UIKit's question for a
 * control: is it inside a scroll view?
 */
function isInsideScroller(element: Element): boolean {
  const doc = element.ownerDocument;
  const view = doc.defaultView;
  if (view == null) {
    return false;
  }
  const root = doc.scrollingElement ?? doc.documentElement;
  let panX = true;
  let panY = true;
  for (let node: Node | null = element; node != null;) {
    if (node instanceof Element) {
      const style = view.getComputedStyle(node);
      const pans = allowedPans(style.touchAction || 'auto');
      panX &&= pans.x;
      panY &&= pans.y;
      if (node === root || node === doc.documentElement) {
        break;
      }
      if (
        (panY &&
          SCROLLABLE.has(style.overflowY) &&
          node.scrollHeight - node.clientHeight > OVERFLOW_TOLERANCE_PX) ||
        (panX &&
          SCROLLABLE.has(style.overflowX) &&
          node.scrollWidth - node.clientWidth > OVERFLOW_TOLERANCE_PX)
      ) {
        return true;
      }
      // A fixed box does not move with any scroller above it: a control in a
      // fixed bar is outside them, however the page scrolls (FR11).
      if (style.position === 'fixed') {
        return false;
      }
    }
    node =
      node.parentNode instanceof ShadowRoot
        ? node.parentNode.host
        : node.parentNode;
  }
  return (
    (panY &&
      rootScrolls(doc, 'y') &&
      root.scrollHeight - root.clientHeight > OVERFLOW_TOLERANCE_PX) ||
    (panX &&
      rootScrolls(doc, 'x') &&
      root.scrollWidth - root.clientWidth > OVERFLOW_TOLERANCE_PX)
  );
}

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
  /** The surface's profile's release clock, in ms. */
  releaseMs: number;
  timer: ReturnType<typeof setTimeout> | null;
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
 * The scroller a finger set moving, from its first scroll until its
 * `scrollend`: during a drag and through the fling that follows the lift.
 *
 * Only a finger-driven scroll is recorded, so the brake cannot fire for a
 * scroll the app performed itself. The test is the touch's own target: a
 * scroll is that finger's if the finger is down inside the scroller that
 * moved, or if it is the fling that finger left running.
 */
let fling: Node | null = null;
/*
 * Where an engine has no `scrollend`, a fling ends once its
 * scroll events stop for PRESS_SCROLL_BRAKE_MS, UIKit's measured brake window
 * (a touch on a scroller that moved this recently brakes it): a decelerating
 * scroller fires a scroll every frame, so that long without one means it has
 * come to rest.
 */
let flingIdleTimer: ReturnType<typeof setTimeout> | undefined;

/** Forget the fling, and the idle timer that stands in for its `scrollend`. */
function clearFling(): void {
  fling = null;
  clearTimeout(flingIdleTimer);
  flingIdleTimer = undefined;
}
/** Whether a finger is on the glass, and where the last one landed. */
let touching = false;
let lastTouchTarget: Node | null = null;
/**
 * Whether a pen is down. A pen raises pointer events but no touch events, so
 * no `touchend` clears it: its `pointerup` does, or, when the browser takes
 * it to scroll (`pointercancel`), the brake window after that, by when the
 * scroll it drives has recorded its fling.
 */
let penDown = false;
let penCancelTimer: ReturnType<typeof setTimeout> | undefined;

function clearPen(): void {
  penDown = false;
  clearTimeout(penCancelTimer);
  penCancelTimer = undefined;
}

/** The machine's clocks; `fade` runs the surface's profile's instead. */
const TIMER_MS: Record<NonNullable<PressStep['timer']>, number> = {
  fade: PRESS_FADE_MS,
  flash: PRESS_FLASH_MS,
  onset: PRESS_ONSET_MS,
};

/**
 * How long a timer runs on a press. The release's clock is its surface's
 * press profile's (`releaseOf`: the value the stylesheet's release plays),
 * capped under reduced motion as the stylesheet caps its fade
 * (`design:reduced-motion` DR2: a touch transition finishes in 200 ms or
 * less).
 */
function timerMs(
  kind: NonNullable<PressStep['timer']>,
  live: {element: Element; releaseMs: number},
): number {
  if (kind !== 'fade') {
    return TIMER_MS[kind];
  }
  const ms = live.releaseMs;
  // design:reduced-motion DR2: under reduced motion a touch transition
  // finishes in 200 ms or less (the stylesheet caps its fade the same way).
  const reduced =
    live.element.ownerDocument.defaultView?.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches ?? false;
  return reduced ? Math.min(ms, REDUCED_MOTION_MAX_MS) : ms;
}

/** The longest a touch transition runs under reduced motion (DR2). */
const REDUCED_MOTION_MAX_MS = 200;

const TIMER_EVENT = {
  fade: 'fadeEnd',
  flash: 'flashEnd',
  onset: 'onset',
} as const;

/** The press attribute's states: on, held, fading on its release, none. */
export type PressPaint = 'on' | 'held' | 'fading' | 'none';

export interface PaintPressOptions {
  /** How long `fading` stays before the attribute goes, ms. @default the press fade */
  releaseMs?: number;
  /** The current values this write may replace. @default none, on, fading */
  onlyFrom?: ReadonlyArray<PressPaint>;
}

/** What a press may replace: a `held` row is its owner's until released. */
const PRESS_REPLACES: ReadonlyArray<PressPaint> = ['none', 'on', 'fading'];
const PAINTS: ReadonlySet<string> = new Set(['on', 'held', 'fading']);
/** A `fading` paint's own release clock, per element (paintPress). */
const fadeTimers = new WeakMap<Element, ReturnType<typeof setTimeout>>();

/** The press state painted on `element` now; `null` for a value no painter wrote. */
export function readPressPaint(element: Element): PressPaint | null {
  const value = element.getAttribute(PRESSED_ATTRIBUTE);
  if (value == null) {
    return 'none';
  }
  return PAINTS.has(value) ? (value as PressPaint) : null;
}

/**
 * Write `next` on `element` if its state is one of `onlyFrom`: THE ONE
 * WRITER of the press attribute, for the controller and every other painter
 * (paintPress), so a fade's clock and the attribute never drift apart. Any
 * write ends a fade paintPress left running there. Returns whether it wrote.
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
    clearTimeout(pending);
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
 * releases it with `onlyFrom: ['held']`). A `fading` paint ends on its own
 * clock. Returns whether it painted. For a painter other than the touch
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
      setTimeout(() => {
        fadeTimers.delete(element);
        if (element.getAttribute(PRESSED_ATTRIBUTE) === 'fading') {
          element.removeAttribute(PRESSED_ATTRIBUTE);
        }
      }, options.releaseMs ?? PRESS_FADE_MS),
    );
  }
  return true;
}

/**
 * The controller's paint, through the one writer: a state the controller did
 * not write is its owner's (a `held` row), so neither a new press nor a
 * release's end overwrites or clears it.
 */
function paintElement(element: HTMLElement, paint: GesturePaint): void {
  // The press is over where its paint goes: its input marker goes with it.
  if (writePress(element, paint) && paint === 'none') {
    element.removeAttribute(PRESS_INPUT_ATTRIBUTE);
  }
}

function clearTimer(slot: Slot): void {
  if (slot.live?.timer != null) {
    clearTimeout(slot.live.timer);
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
    settle();
    return;
  }
  if (step.timer != null) {
    const kind = step.timer;
    // A TIMER, never `requestAnimationFrame`: iOS throttles frame callbacks
    // while a scroll runs, so a frame-based delay would fire late, after the
    // scroll, and paint a control nobody is pressing any more.
    live.timer = setTimeout(
      () => {
        if (slot.live != null) {
          slot.live.timer = null;
        }
        apply(
          slot,
          pressGestureStep(slot.live?.gesture ?? idlePressGesture(), {
            kind: TIMER_EVENT[kind],
          }),
        );
      },
      timerMs(kind, live),
    );
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
/**
 * A native control nested in a pressable surface: a press on it is the
 * control's own, not the surface's.
 */
const NESTED_CONTROL = 'a[href], button, [role="button"], [role="link"]';

function surfaceAt(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) {
    return null;
  }
  const found = target.closest(`[${PRESSABLE_ATTRIBUTE}]`);
  if (!(found instanceof HTMLElement) || found.matches(DISABLED)) {
    return null;
  }
  // A native control inside the surface (a link or a button in a row's
  // description) takes its own press, for every pointer: the rule
  // RadioListItem's `:active:not(:has(...))` arm kept for a mouse.
  const control = target.closest(NESTED_CONTROL);
  if (control != null && control !== found && found.contains(control)) {
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
 *     tap a control, then press a button inside a pane that is scrolling on
 *     its own, and that press would be swallowed by a scroll no finger drove.
 */
function scrollerIsBraking(element: HTMLElement): boolean {
  if (fling != null && !fling.isConnected) {
    // The scroller left the document mid-fling: no `scrollend` will come.
    clearFling();
  }
  return fling != null && fling.contains(element);
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
    settle();
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
  live.element.removeAttribute(PRESS_INPUT_ATTRIBUTE);
  slot.live = null;
  if (slot === button) {
    holdKey(false);
  }
  settle();
}

/** A new press on an element owns its paint: the other slot's gesture there ends. */
function takeOver(other: Slot, element: HTMLElement): void {
  if (other.live?.element === element) {
    finish(other);
  }
}

/**
 * The release's clock for a press on a surface of `profile`: the profile's
 * own under a coarse primary pointer, and the deselect clock it always had
 * with any other pointer (a finger on a touch screen beside a mouse), as the
 * stylesheet's release arms are (the desktop rule, `spec:AST-017` FR59/DEC-25).
 */
function releaseOf(profile: PressProfile): Pick<PressProfile, 'releaseMs'> {
  // The same coarse gate the stylesheet's release arms use.
  const {releaseMs} = stylesheetDroppedActive() ? profile : PRESS_PROFILES.cell;
  return {releaseMs};
}

/**
 * Whether the stylesheet drops `:active` here (a coarse primary pointer): a
 * Space press is then the controller's to paint, and every release takes its
 * profile's clock. Asked at each such press: rendering a pressable never
 * queries the pointer, so a layout that must not depend on it stays
 * independent.
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
  track();
  // A mouse's release is a finger's on this device (FR11). A key keeps the
  // fine pointer's 200 ms release on any surface, and the marker tells the
  // stylesheet's release arms the same.
  button.live = {
    element,
    gesture: idlePressGesture(),
    pointerId,
    releaseMs:
      pointerId == null
        ? PRESS_PROFILES.cell.releaseMs
        : releaseOf(profileOf(element)).releaseMs,
    timer: null,
  };
  if (pointerId == null) {
    element.setAttribute(PRESS_INPUT_ATTRIBUTE, 'key');
  }
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
    // A mouse is a fine pointer: its press paints at once, through this
    // controller and the release fade a finger's has, in place of the
    // browser's `:active` (`spec:AST-094` FR11, FR43, DEC-21). Only a
    // primary click: a right click and a ctrl-click on macOS ask for the
    // context menu.
    if (isPrimaryClick(event)) {
      pressButton(event.target, event.pointerId);
    }
    return;
  }
  if (event.pointerType === 'pen' && !isPrimaryClick(event)) {
    // A pen's barrel or eraser button: not a press.
    return;
  }
  // Any finger arms the listeners, a press or not: the scroll it may start is
  // what the brake listens for.
  track();
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
  // The finger is recorded AFTER the brake reads the fling, deliberately: the
  // question the brake asks is whether a PREVIOUS finger's fling is still
  // running here.
  // The brake is a finger's: a pen, a fine pointer, presses at once, even on
  // a list a finger left moving (FR11).
  const braking =
    event.pointerType === 'touch' &&
    element != null &&
    scrollerIsBraking(element);
  if (event.pointerType === 'pen') {
    clearPen();
    penDown = true;
  } else {
    // A finger counts as down only where its lift is heard: the touch-only
    // listeners are on only while the primary pointer is coarse (FR24).
    touching = isCoarsePointer(window);
  }
  lastTouchTarget = event.target instanceof Node ? event.target : null;
  if (element == null || braking) {
    settle();
    return;
  }
  takeOver(button, element);
  const profile = profileOf(element);
  finger.live = {
    element,
    gesture: idlePressGesture(),
    pointerId: event.pointerId,
    ...releaseOf(profile),
    timer: null,
  };
  apply(
    finger,
    pressGestureStep(finger.live.gesture, {
      kind: 'down',
      x: event.clientX,
      y: event.clientY,
      // A pen presses at once, in a scroll view too: the content-touch delay
      // waits out a finger's scroll (FR11).
      delayed:
        event.pointerType === 'touch' &&
        (profile.highlightDelay === 'always' || isInsideScroller(element)),
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
  if (event.target instanceof Node) {
    lastTouchTarget = event.target;
  }
  if (event.pointerType === 'pen') {
    // A pen's lift: no touchend follows.
    clearPen();
  }
  const live = finger.live;
  if (
    live == null ||
    (live.pointerId != null && event.pointerId !== live.pointerId)
  ) {
    settle();
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
  if (pointer?.pointerType === 'pen' && penDown) {
    // The browser took the pen to scroll: its scroll still drives the
    // scroller until that scroll records its fling, within the brake window.
    clearTimeout(penCancelTimer);
    penCancelTimer = setTimeout(() => {
      penDown = false;
      penCancelTimer = undefined;
      settle();
    }, PRESS_SCROLL_BRAKE_MS);
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
  // A scroll counts as a finger's only if that finger is down inside THIS
  // scroller, or this is the fling it left running. Anything else is the
  // program moving something, and must leave the brake unarmed. The fling
  // ends at its `scrollend`, or where there is none, once its scroll events
  // stop for the brake window (PRESS_SCROLL_BRAKE_MS).
  const driven =
    (touching || penDown || fling === scroller) &&
    lastTouchTarget != null &&
    scroller.contains(lastTouchTarget);
  if (driven) {
    fling = scroller;
    if (!('onscrollend' in window)) {
      clearTimeout(flingIdleTimer);
      flingIdleTimer = setTimeout(() => {
        if (fling === scroller) {
          clearFling();
          settle();
        }
      }, PRESS_SCROLL_BRAKE_MS);
    }
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

/**
 * The fling stopped: the brake's window ends here, at the scroller's own
 * signal, and so do the listeners that waited for it.
 */
function onScrollEnd(event: Event): void {
  const scroller = event.target instanceof Node ? event.target : document;
  if (fling != null && scroller === fling) {
    clearFling();
    settle();
  }
}

/** The last finger left the glass. */
function onTouchEnd(event: TouchEvent): void {
  if (event.touches.length === 0) {
    touching = false;
    settle();
  }
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
    // A hidden page hears no lift and no `scrollend`: nothing is down or
    // flinging when it comes back.
    touching = false;
    clearPen();
    clearFling();
    finish(finger);
    finish(button);
  }
}

const PASSIVE_CAPTURE = {capture: true, passive: true} as const;
const PASSIVE = {passive: true} as const;

/*
 * Pointer, touch, drag, scroll and visibility input arrive through the shared
 * input stream (utils/inputStream.ts): one passive listener per type on the
 * window's capture phase for every subscriber in the page, which an app's
 * capture-phase stopPropagation cannot starve, and which hears every
 * scroller's `scroll` and `scrollend` (neither bubbles). The keyboard stays
 * on the window's bubble phase, outside the stream: a Space press must see
 * the target's `preventDefault` (`defaultPrevented`), as `:active` does, and
 * only the bubble phase has run the target's own listeners.
 */

/** The stream subscriptions that arm the controller, while it is installed. */
let arming: (() => void)[] = [];
/** The stream subscriptions that track a live press, while one is. */
let trackingSubscriptions: (() => void)[] = [];

const unsubscribeAll = (subscriptions: (() => void)[]): void => {
  for (const unsubscribe of subscriptions.splice(0)) {
    unsubscribe();
  }
};

/** The two listeners a document carries at rest: they only arm the rest. */
function addArmingListeners(): void {
  arming = [subscribeInput(window, 'pointerdown', onPointerDown)];
  window.addEventListener('keydown', onKeyDown, PASSIVE);
}

function removeArmingListeners(): void {
  unsubscribeAll(arming);
  window.removeEventListener('keydown', onKeyDown);
}

function addTrackingListeners(): void {
  trackingSubscriptions = [
    subscribeInput(window, 'pointermove', onPointerMove),
    subscribeInput(window, 'pointerup', onPointerUp),
    subscribeInput(window, 'pointercancel', onCancel),
    subscribeInput(window, 'dragstart', onDragStart),
    subscribeInput(window, 'scroll', onScroll),
    subscribeInput(window, 'scrollend', onScrollEnd),
    subscribeInput(window, 'visibilitychange', onVisibilityChange),
  ];
  stopWatchingPointer = watchCoarsePointer(window, followPointer);
  hearTouch(isCoarsePointer(window));
}

function removeTrackingListeners(): void {
  unsubscribeAll(trackingSubscriptions);
  stopWatchingPointer?.();
  stopWatchingPointer = null;
  hearTouch(false);
}

/** The finger's touch-only subscriptions, while tracked and coarse. */
let touchSubscriptions: (() => void)[] = [];
/** Stops following the primary pointer, while a press is tracked. */
let stopWatchingPointer: (() => void) | null = null;

/**
 * The finger's touch-only listeners are on only while the primary pointer is
 * coarse (`spec:AST-094` FR24); where it is fine, a finger's press still ends
 * through `pointerup` and `pointercancel`.
 */
function hearTouch(on: boolean): void {
  if (on === touchSubscriptions.length > 0) {
    return;
  }
  if (on) {
    touchSubscriptions = [
      subscribeInput(window, 'touchcancel', onCancel),
      subscribeInput(window, 'touchend', onTouchEnd),
      subscribeInput(window, 'touchcancel', onTouchEnd),
    ];
  } else {
    unsubscribeAll(touchSubscriptions);
  }
}

/** The primary pointer turned coarse or fine while a press is tracked. */
function followPointer(isCoarse: boolean): void {
  hearTouch(isCoarse);
  if (!isCoarse && touching) {
    // Nothing hears the finger's lift any more.
    touching = false;
    settle();
  }
}

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

/** Whether the tracking listeners are attached. */
let tracking = false;

/** A press, or a finger, is live: attach the tracking listeners. */
function track(): void {
  if (!tracking) {
    tracking = true;
    addTrackingListeners();
  }
}

function untrack(): void {
  if (tracking) {
    tracking = false;
    removeTrackingListeners();
  }
}

/**
 * Take the tracking listeners down once nothing needs them: no press is live,
 * no finger is down, and no fling a finger left running is still scrolling
 * (its `scrollend` calls this again).
 */
function settle(): void {
  if (
    finger.live != null ||
    button.live != null ||
    touching ||
    penDown ||
    fling != null
  ) {
    return;
  }
  untrack();
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
    addArmingListeners();
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
    removeArmingListeners();
    finish(finger);
    finish(button);
    untrack();
    touching = false;
    clearPen();
    clearFling();
    lastTouchTarget = null;
  };
}
