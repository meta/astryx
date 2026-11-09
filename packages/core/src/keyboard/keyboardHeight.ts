// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file keyboardHeight.ts
 * @input The visual viewport, the window's input stream (focus, blur,
 *   resize, scroll and touch), and the layout viewport's height
 * @output The on-screen keyboard module: measureKeyboardHeight,
 *   isKeyboardMeasurable, hasVirtualKeyboard, subscribeKeyboardHeight,
 *   getKeyboardHeight, getKeyboardPan, isTextEntryControl,
 *   findTextEntryControl, refuseFocusReveal, watchRevealPan and
 *   subscribeViewportRest. It also keeps whether a window's browser leaves a
 *   fixed dock covered (isDockLeftCovered)
 * @position Core's one source for the on-screen keyboard. It is internal to
 *   core and never exported from the package.
 *
 * SYNC: When modified, update /packages/core/src/keyboard/README.md
 */

import {armClickGuard} from '../utils/clickGuard';
import {matchesMediaQuery} from '../utils/coarsePointer';
import {subscribeInput} from '../utils/inputStream';
import {isNode} from '../utils/nodeType';
import {layoutViewportHeight} from '../utils/layoutViewport';
import {PRESS_SLOP_PX} from '../utils/pressGesture';
import {caretAt} from '../utils/selectionLock';

// A shortfall smaller than this is rounding, not a keyboard.
export const KEYBOARD_EPSILON = 1;
// Android's Remove animations setting, which makes Chrome report a hide in
// steps.
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
// How long a step of a hide waits for the next report. It is longer than
// Gboard's whole hide (hideMs).
const HIDE_STEP_WAIT_MS = 300;
// How long a hide's steps wait in all, from the first. A toolbar's moves
// while a lower keyboard stays up cannot hold the layout longer.
const HIDE_STEP_LIMIT_MS = 1000;
const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

/**
 * Whether this window measures the keyboard: a top-level document with a
 * visual viewport. Capabilities decide it, never the user agent or the
 * pointer. The module measures a browser with its own keyboard geometry API,
 * such as Chrome on Android with the VirtualKeyboard API, the same way.
 * Its visual viewport shrinks for the keyboard while the layout viewport keeps
 * its height, as everywhere else. A desktop browser's visual viewport never
 * shrinks for a keyboard, so it reads 0. Where the app sets
 * `interactive-widget=resizes-content`, Chrome shrinks the layout viewport
 * with the keyboard. The height is then 0 too, and nothing rides, because the
 * browser has made the room itself.
 */
export function isKeyboardMeasurable(win: Window): boolean {
  return win.visualViewport != null && win.self === win.top;
}

/**
 * The on-screen keyboard's height over the layout viewport, CSS px. It is 0
 * when none is shown, also while pinch-zoomed, and wherever
 * `isKeyboardMeasurable` is false.
 */
export function measureKeyboardHeight(win: Window): number {
  return measureReport(win).height;
}

interface KeyboardMeasure {
  height: number;
  pan: number | null;
  cover: number | null;
}

// One read of the visual viewport: the keyboard's height, the viewport's pan
// and how far the keyboard covers the initial containing block. The last two
// are null under a pinch zoom, whose pan is the reader's. Safari on iOS can
// shrink the layout viewport to the visual viewport while it pans, but the
// initial containing block keeps its height. layoutViewportHeight reads the
// root's client height in the same batch, so that read adds no layout.
function measureReport(win: Window): KeyboardMeasure {
  const viewport = win.visualViewport;
  if (viewport == null || !isKeyboardMeasurable(win)) {
    return {height: 0, pan: null, cover: null};
  }
  const scale = viewport.scale ?? 1;
  const visualHeight = viewport.height;
  const height = layoutViewportHeight(win) - visualHeight * scale;
  const isUnzoomed = scale === 1;
  return {
    height: height > KEYBOARD_EPSILON ? Math.round(height * 100) / 100 : 0,
    pan: isUnzoomed ? viewport.offsetTop : null,
    cover: isUnzoomed
      ? Math.max(0, win.document.documentElement.clientHeight - visualHeight)
      : null,
  };
}

/** A report from the keyboard module, in the order the window raised them. */
export type KeyboardHeightEvent =
  | {
      /** The visual viewport or the window changed size or position. */
      type: 'viewport';
      /** The keyboard height after this report. */
      height: number;
      /** The report's event time (the document timeline). */
      timeStamp: number;
    }
  | {
      /** Focus moved into (`focusin`) or out of (`focusout`) `target`. */
      type: 'focusin' | 'focusout';
      height: number;
      timeStamp: number;
      target: EventTarget | null;
      relatedTarget: EventTarget | null;
    };

interface KeyboardStore {
  height: number;
  /** The visual viewport's pan at the last report (getKeyboardPan). */
  pan: number | null;
  /** The keyboard's cover of the initial containing block at that report. */
  cover: number | null;
  listeners: Set<(event: KeyboardHeightEvent) => void>;
  /** The subscribers that asked for focus moves too (the layout guide). */
  focusListeners: Set<(event: KeyboardHeightEvent) => void>;
  detach: (() => void) | null;
  detachFocus: (() => void) | null;
}

const stores = new WeakMap<Window, KeyboardStore>();

function storeOf(win: Window): KeyboardStore {
  let store = stores.get(win);
  if (store == null) {
    store = {
      height: 0,
      pan: null,
      cover: null,
      listeners: new Set(),
      focusListeners: new Set(),
      detach: null,
      detachFocus: null,
    };
    stores.set(win, store);
  }
  return store;
}

/**
 * Whether `win` has the VirtualKeyboard API, as Chrome on Android does. The
 * keyboard layout guide reads Chrome's profile there (keyboardProfileOf).
 */
export function hasVirtualKeyboard(win: Window): boolean {
  return 'virtualKeyboard' in win.navigator;
}

// Whether a report of `height` is one step of a hide. Under Remove
// animations, Chrome on Android reports a hide as several lower keyboards
// that are still up, before the report of none.
function isHideStep(win: Window, shown: number, height: number): boolean {
  return (
    height > KEYBOARD_EPSILON &&
    height < shown - KEYBOARD_EPSILON &&
    hasVirtualKeyboard(win) &&
    matchesMediaQuery(win, REDUCED_MOTION_QUERY)
  );
}

function attach(win: Window, store: KeyboardStore): () => void {
  const viewport = win.visualViewport;
  const first = measureReport(win);
  store.height = first.height;
  store.pan = first.pan;
  store.cover = first.cover;
  // Set while a step of a hide waits. The store keeps the height it reported,
  // so every reader lays out once, when the keyboard comes to rest.
  let stepTimer: ReturnType<typeof setTimeout> | null = null;
  let stepHeight = 0;
  let stepLimit = 0;
  const deliver = (measure: KeyboardMeasure, timeStamp: number) => {
    const {height} = measure;
    store.height = height;
    store.pan = measure.pan;
    store.cover = measure.cover;
    const report: KeyboardHeightEvent = {type: 'viewport', height, timeStamp};
    for (const listener of [...store.listeners]) {
      listener(report);
    }
  };
  const onViewport = (event: Event) => {
    const measure = measureReport(win);
    const {height} = measure;
    if (isHideStep(win, store.height, height)) {
      // A pan reports the same step again, and leaves the wait as it is.
      if (
        stepTimer != null &&
        Math.abs(height - stepHeight) < KEYBOARD_EPSILON
      ) {
        return;
      }
      const now = win.performance.now();
      if (stepTimer == null) {
        stepLimit = now + HIDE_STEP_LIMIT_MS;
      } else {
        clearTimeout(stepTimer);
      }
      stepHeight = height;
      // The report of none, a report back up, or a quiet spell ends the wait.
      stepTimer = setTimeout(
        () => {
          stepTimer = null;
          deliver(measureReport(win), win.performance.now());
        },
        Math.min(HIDE_STEP_WAIT_MS, stepLimit - now),
      );
      return;
    }
    if (stepTimer != null) {
      clearTimeout(stepTimer);
      stepTimer = null;
    }
    deliver(measure, event.timeStamp);
  };
  viewport?.addEventListener('resize', onViewport);
  viewport?.addEventListener('scroll', onViewport);
  // Only the window's own resize reports: a window's own event has no node as
  // its target.
  const stopResize = subscribeInput(win, 'resize', event => {
    if (!isNode(event.target)) {
      onViewport(event);
    }
  });
  return () => {
    if (stepTimer != null) {
      clearTimeout(stepTimer);
      stepTimer = null;
    }
    viewport?.removeEventListener('resize', onViewport);
    viewport?.removeEventListener('scroll', onViewport);
    stopResize();
  };
}

// Focus moves are heard only while a subscriber asks for them. A viewport
// reader, such as a Tall BottomSheet's hook under any pointer, adds no focus
// listener.
function attachFocus(win: Window, store: KeyboardStore): () => void {
  const onFocus = (event: FocusEvent) => {
    const report: KeyboardHeightEvent = {
      type: event.type === 'focusin' ? 'focusin' : 'focusout',
      height: store.height,
      timeStamp: event.timeStamp,
      target: event.target,
      relatedTarget: event.relatedTarget,
    };
    for (const listener of [...store.focusListeners]) {
      listener(report);
    }
  };
  const stopFocusIn = subscribeInput(win, 'focusin', onFocus);
  const stopFocusOut = subscribeInput(win, 'focusout', onFocus);
  return () => {
    stopFocusIn();
    stopFocusOut();
  };
}

/**
 * Calls `listener` with every report of `win`'s keyboard until the caller
 * runs the returned function. It reports the viewport's changes, and focus
 * moves too when the caller sets `focus`. All subscribers of a window share
 * one set of listeners, and its focus listeners exist only while a subscriber
 * asks for focus moves.
 *
 * @example
 * ```
 * const stop = subscribeKeyboardHeight(window, event => {
 *   if (event.type === 'viewport') layout(event.height);
 * });
 * ```
 */
export function subscribeKeyboardHeight(
  win: Window,
  listener: (event: KeyboardHeightEvent) => void,
  {focus = false}: {focus?: boolean} = {},
): () => void {
  const store = storeOf(win);
  store.listeners.add(listener);
  if (store.detach == null) {
    store.detach = attach(win, store);
  }
  if (focus) {
    store.focusListeners.add(listener);
    if (store.detachFocus == null) {
      store.detachFocus = attachFocus(win, store);
    }
  }
  return () => {
    store.listeners.delete(listener);
    if (focus) {
      store.focusListeners.delete(listener);
      if (store.focusListeners.size === 0 && store.detachFocus != null) {
        store.detachFocus();
        store.detachFocus = null;
      }
    }
    if (store.listeners.size === 0 && store.detach != null) {
      store.detach();
      store.detach = null;
    }
  };
}

/**
 * `win`'s keyboard height. While the module listens, it is the height
 * measured at the last report. Every reader of a keyboard change, such as
 * each component's hook, shares that one layout read. Every change of the
 * visual viewport or the window is a report, so a reader between two reports
 * sees the current height. With nothing listening yet, the call measures the
 * height now.
 */
export function getKeyboardHeight(win: Window): number {
  const store = stores.get(win);
  return store?.detach != null ? store.height : measureKeyboardHeight(win);
}

// The visual viewport's pan down the layout viewport, CSS px, or null under a
// pinch zoom, whose pan is the reader's.
function measurePan(win: Window): number | null {
  const viewport = win.visualViewport;
  return viewport != null && viewport.scale === 1 ? viewport.offsetTop : null;
}

/**
 * How far `win`'s visual viewport is panned down the layout viewport, CSS px,
 * or null under a pinch zoom. While the module listens, it is the pan read
 * with the last report's height, so a reader adds no read of its own.
 */
export function getKeyboardPan(win: Window): number | null {
  const store = stores.get(win);
  return store?.detach != null ? store.pan : measurePan(win);
}

/**
 * Whether focusing `element` brings up a keyboard for typing text. A control
 * with `inputmode="none"` brings up none.
 */
export function isTextEntryControl(
  element: Element | null,
): element is HTMLElement {
  if (
    element instanceof HTMLElement &&
    element.getAttribute('inputmode') === 'none'
  ) {
    return false;
  }
  if (element instanceof HTMLTextAreaElement) {
    return !element.disabled && !element.readOnly;
  }
  if (element instanceof HTMLInputElement) {
    return (
      !element.disabled &&
      !element.readOnly &&
      !NON_TEXT_INPUT_TYPES.has(
        (element.getAttribute('type') ?? 'text').toLowerCase(),
      )
    );
  }
  return (
    element instanceof HTMLElement &&
    element.matches('[contenteditable]:not([contenteditable="false"])')
  );
}

/** The text-entry control inside `container` that `target` is or labels. */
export function findTextEntryControl(
  target: EventTarget | null,
  container: HTMLElement,
): HTMLElement | null {
  if (!(target instanceof Element)) {
    return null;
  }

  const direct = target.closest(
    'input, textarea, [contenteditable]:not([contenteditable="false"])',
  );
  if (container.contains(direct) && isTextEntryControl(direct)) {
    return direct;
  }

  const label = target.closest('label');
  const control = label instanceof HTMLLabelElement ? label.control : null;
  return container.contains(control) && isTextEntryControl(control)
    ? control
    : null;
}

/** The caller's rules for refuseFocusReveal. */
export interface RefuseFocusRevealOptions {
  /** Whether to claim at all just now, checked on every blur. */
  isActive?: () => boolean;
  /** The control a focus move is heading to, when this caller claims it. */
  claim: (destination: EventTarget | null) => HTMLElement | null;
  /** Focus left `origin` for nothing (the keyboard's Done): park it, if at all. */
  park?: (origin: EventTarget | null) => void;
}

// One shared `blur` subscription per document serves every caller of
// refuseFocusReveal in it, so listeners do not grow with the number of
// instances. The first caller adds it, and the last removes it.
const focusTakeovers = new WeakMap<
  Document,
  {
    stop: () => void;
    callers: Set<(event: FocusEvent) => void>;
  }
>();

/**
 * Delivers the focus moves `claim` accepts with `preventScroll`, so the
 * browser never reveals their destination itself. It stops when the caller
 * runs the returned function.
 *
 * The browser dispatches `blur` in the capture phase ahead of its own focus
 * step, and `blur` names the destination in `relatedTarget`. Focusing it there
 * with preventScroll settles the change. The browser's step then finds the
 * element already active, so it dispatches nothing further and reveals
 * nothing.
 *
 * @example
 * ```
 * const stop = refuseFocusReveal(document, {
 *   claim: target => findTextEntryControl(target, body),
 *   park: () => sheet.focus({preventScroll: true}),
 * });
 * ```
 */
export function refuseFocusReveal(
  doc: Document,
  {isActive, claim, park}: RefuseFocusRevealOptions,
): () => void {
  const onBlur = (event: FocusEvent) => {
    if (isActive != null && !isActive()) {
      return;
    }
    const destination = claim(event.relatedTarget);
    if (destination != null) {
      if (destination !== doc.activeElement) {
        destination.focus({preventScroll: true});
      }
      return;
    }
    if (event.relatedTarget == null) {
      park?.(event.target);
    }
  };
  let shared = focusTakeovers.get(doc);
  if (shared == null) {
    const view = doc.defaultView;
    if (view == null) {
      return () => {};
    }
    const callers = new Set<(event: FocusEvent) => void>();
    // Callers hear each blur in the order they came, as separate listeners
    // would; one that stopped during this blur no longer hears it.
    const listener = (event: FocusEvent) => {
      for (const caller of [...callers]) {
        if (callers.has(caller)) {
          caller(event);
        }
      }
    };
    // `blur` does not bubble: only the capture phase hears every one, and it
    // runs before the browser's own focus step. The window's own blur moves
    // no focus inside the document.
    const stop = subscribeInput(view, 'blur', event => {
      if (isNode(event.target)) {
        listener(event);
      }
    });
    shared = {stop, callers};
    focusTakeovers.set(doc, shared);
  }
  shared.callers.add(onBlur);
  return () => {
    const current = focusTakeovers.get(doc);
    if (current == null || !current.callers.delete(onBlur)) {
      return;
    }
    if (current.callers.size === 0) {
      current.stop();
      focusTakeovers.delete(doc);
    }
  };
}

/**
 * Test-only: how many callers refuse the focus reveal in `doc`, through its
 * one shared subscription. Not part of the runtime API.
 *
 * @internal
 */
export function __focusTakeoverCallersForTest(doc: Document): number {
  return focusTakeovers.get(doc)?.callers.size ?? 0;
}

// One shared listener per window hears the visual viewport's scroll end, for
// every caller. The first caller adds it, and the last removes it.
const viewportRests = new WeakMap<
  Window,
  {stop: () => void; listeners: Set<() => void>}
>();

/**
 * Calls `listener` when a scroll of `win`'s visual viewport comes to rest,
 * such as the end of a pan's fling. A pan that moves no document scroller
 * raises no document scroll end. Returns the unsubscribe function.
 */
export function subscribeViewportRest(
  win: Window,
  listener: () => void,
): () => void {
  let shared = viewportRests.get(win);
  if (shared == null) {
    const viewport = win.visualViewport;
    if (viewport == null) {
      return () => {};
    }
    const listeners = new Set<() => void>();
    const onRest = () => {
      for (const each of [...listeners]) {
        each();
      }
    };
    viewport.addEventListener('scrollend', onRest);
    shared = {
      stop: () => viewport.removeEventListener('scrollend', onRest),
      listeners,
    };
    viewportRests.set(win, shared);
  }
  shared.listeners.add(listener);
  return () => {
    const current = viewportRests.get(win);
    if (current == null || !current.listeners.delete(listener)) {
      return;
    }
    if (current.listeners.size === 0) {
      current.stop();
      viewportRests.delete(win);
    }
  };
}

/** The caller's rules for watchRevealPan. */
export interface WatchRevealPanOptions {
  /** Whether the focused field is the caller's to keep in view. */
  owns: (focused: HTMLElement) => boolean;
  /** Called on every touch start, which ends the watch for the report. */
  onTouch?: () => void;
  /**
   * The field sits in a fixed dock of a page that scrolls the document. Each
   * keyboard show then decides once whether the browser pans the visual
   * viewport to the dock (isDockLeftCovered). Off by default.
   * @default false
   */
  dock?: boolean;
}

/** A watch for the browser's own reveal pan (see watchRevealPan). */
export interface RevealPanWatch {
  /** A report changed the keyboard's height: remember where everything sat. */
  report: () => void;
  /** Whether the visual viewport has since moved down as a reveal pan. */
  isRevealPan: (height: number) => boolean;
  /**
   * Pans the visual viewport back to where it sat at the report, without
   * scrolling the document. It scrolls `anchor` into view, an element fixed at
   * the layout viewport's top, or else a probe fixed where the viewport sat.
   */
  putBack: (anchor?: Element | null) => void;
  /**
   * With `dock`, feeds a keyboard report to the dock's watch. True while the
   * browser keeps the reveal, so the caller puts no pan back. Without `dock`,
   * always false.
   */
  dockReport: (height: number) => boolean;
  /** Ends the watch; the shared touch subscription goes with the last watch. */
  stop: () => void;
}

// One shared touch subscription per document serves every reveal-pan watch
// in it, so no instance adds a listener. The first watch adds it, and the
// last removes it.
const touchStartWatches = new WeakMap<
  Document,
  {stop: () => void; watches: Set<() => void>}
>();

function watchTouchStarts(doc: Document, onTouchStart: () => void): () => void {
  let shared = touchStartWatches.get(doc);
  if (shared == null) {
    const view = doc.defaultView;
    if (view == null) {
      return () => {};
    }
    const watches = new Set<() => void>();
    const stop = subscribeInput(view, 'touchstart', () => {
      for (const watch of [...watches]) {
        watch();
      }
    });
    shared = {stop, watches};
    touchStartWatches.set(doc, shared);
  }
  shared.watches.add(onTouchStart);
  return () => {
    const current = touchStartWatches.get(doc);
    if (current == null || !current.watches.delete(onTouchStart)) {
      return;
    }
    if (current.watches.size === 0) {
      current.stop();
      touchStartWatches.delete(doc);
    }
  };
}

// How long a dock's keyboard show waits for the browser's own pan to the
// dock, from the show's opening report. Only a pan restarts the wait: the
// height reports of the keyboard's slide do not. The cap ends a wait that pans
// keep restarting. Safari on iOS pans up to about 400 ms after the keyboard's
// report.
const DOCK_REVEAL_SETTLE_MS = 700;
const DOCK_REVEAL_CAP_MS = 3000;

// The windows whose browser left a fixed dock covered at a keyboard show with
// no touch or wheel in the wait.
const docksLeftCovered = new WeakSet<Window>();
// The windows whose current show lifts the dock by the part of the cover the
// visual viewport's pan leaves, and teaches nothing. That is a show for a
// field outside the dock. It is also a show with a touch or a wheel once the
// browser's own reveal is over.
const deficitShows = new WeakSet<Window>();
const dockRevealListeners = new Set<() => void>();
let dockRevealVersion = 0;

function notifyDockReveal(): void {
  dockRevealVersion += 1;
  for (const listener of [...dockRevealListeners]) {
    listener();
  }
}

function learnDockLeftCovered(win: Window): void {
  if (!docksLeftCovered.has(win)) {
    docksLeftCovered.add(win);
    notifyDockReveal();
  }
}

/**
 * Whether `win`'s browser was found to leave a fixed dock covered at a
 * keyboard show. A pan to the dock decides only its own show and teaches
 * nothing. A browser can pan at one show and not at the next. Once learned, it
 * holds for the page.
 */
export function isDockLeftCovered(win: Window): boolean {
  return docksLeftCovered.has(win);
}

/**
 * Whether the fixed dock in `win` rises at this keyboard show by the part of
 * the cover the visual viewport's pan leaves (getKeyboardPan).
 */
export function followsDockDeficit(win: Window): boolean {
  return deficitShows.has(win);
}

/** Calls `listener` when isDockLeftCovered or followsDockDeficit changes. */
export function subscribeDockReveal(listener: () => void): () => void {
  dockRevealListeners.add(listener);
  return () => {
    dockRevealListeners.delete(listener);
  };
}

/** A number that changes whenever a window's dock reveal changes. */
export function getDockRevealVersion(): number {
  return dockRevealVersion;
}

/**
 * Test-only: forgets what `win`'s browser was found to do with a fixed dock.
 * Not part of the runtime API.
 *
 * @internal
 */
export function __resetDockRevealForTest(win: Window): void {
  const known = docksLeftCovered.delete(win);
  if (deficitShows.delete(win) || known) {
    notifyDockReveal();
  }
}

// The dock's watch: one decision per keyboard show for the dock's field. A
// pan to the dock decides that show alone: no lift. A dock still covered when
// the wait ends rises. With no touch or wheel in the wait, the page learns that
// its browser leaves the dock covered. In the show that learned it, a later pan
// to the dock before any input is put back, as at every later show. After a
// touch or a wheel, once the browser's reveal is over, the
// dock follows the part of the cover that the pan leaves. So a reader's scroll
// that moves the pan keeps the dock on the keyboard.
function watchDock(
  win: Window,
  owns: (focused: HTMLElement) => boolean,
  putBackTo: (top: number) => void,
): {
  report: (height: number) => boolean;
  input: () => void;
  stop: () => void;
} {
  let show: 'none' | 'other' | 'watching' | 'revealed' | 'covered' | 'deficit' =
    'none';
  // Set once the show finds the layout viewport's height following the pan,
  // as in Safari on iOS. The dock then holds for the rest of the show: a lift
  // there makes the browser reveal the focused field again.
  let layoutFollowsPan = false;
  let lastPan = getKeyboardPan(win);
  let coveredPan = 0;
  let isClassifying = false;
  // Only the next show's opening report clears it.
  let inputSinceShow = false;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  let capTimer: ReturnType<typeof setTimeout> | null = null;
  const clearTimers = () => {
    if (settleTimer != null) {
      clearTimeout(settleTimer);
      settleTimer = null;
    }
    if (capTimer != null) {
      clearTimeout(capTimer);
      capTimer = null;
    }
  };
  const ownsFocus = () => {
    const focused = win.document.activeElement;
    return focused instanceof HTMLElement && owns(focused);
  };
  // With no lift, the dock rests at or above the visual viewport's bottom.
  const isRevealed = (pan: number | null, height: number): pan is number =>
    pan != null && pan >= height - 1;
  // A pan the browser made before any input of the show.
  const isRevealPan = (pan: number | null, height: number): pan is number =>
    !inputSinceShow && isRevealed(pan, height);
  const followDeficit = () => {
    clearTimers();
    show = 'deficit';
    if (!layoutFollowsPan && !deficitShows.has(win)) {
      deficitShows.add(win);
      notifyDockReveal();
    }
  };
  // The layout viewport shrinks as the pan grows: the height and the pan add
  // up to the cover of the initial containing block.
  const seesLayoutFollowPan = (height: number, pan: number | null) => {
    const cover = stores.get(win)?.cover ?? null;
    return (
      pan != null &&
      pan > 0.5 &&
      cover != null &&
      height < cover - 1 &&
      Math.abs(height + pan - cover) <= 1.5
    );
  };
  // The wait's end decides the show. Only a clean wait that ends on its own
  // teaches the page. Under a pinch zoom the pan is the reader's, so that show
  // teaches nothing either.
  const settle = (atCap: boolean) => {
    clearTimers();
    const pan = getKeyboardPan(win);
    const revealed = isRevealed(pan, getKeyboardHeight(win));
    if (inputSinceShow || atCap || pan == null) {
      followDeficit();
    } else if (revealed) {
      show = 'revealed';
    } else {
      show = 'covered';
      coveredPan = getKeyboardPan(win) ?? 0;
      isClassifying = true;
      learnDockLeftCovered(win);
    }
  };
  const restartSettle = () => {
    if (settleTimer != null) {
      clearTimeout(settleTimer);
    }
    settleTimer = setTimeout(() => {
      settleTimer = null;
      if (show === 'watching') {
        settle(false);
      }
    }, DOCK_REVEAL_SETTLE_MS);
  };
  const markInput = () => {
    inputSinceShow = true;
    if (show === 'revealed') {
      followDeficit();
    }
  };
  const stopWheels = subscribeInput(win, 'wheel', markInput);
  const report = (height: number): boolean => {
    const pan = getKeyboardPan(win);
    const panned =
      pan == null || lastPan == null
        ? pan !== lastPan
        : Math.abs(pan - lastPan) > 0.5;
    lastPan = pan;
    if (height <= 0) {
      clearTimers();
      show = 'none';
      isClassifying = false;
      layoutFollowsPan = false;
      if (deficitShows.delete(win)) {
        notifyDockReveal();
      }
      return !docksLeftCovered.has(win);
    }
    if (!layoutFollowsPan && seesLayoutFollowPan(height, pan)) {
      layoutFollowsPan = true;
      if (deficitShows.delete(win)) {
        notifyDockReveal();
      }
    }
    if (show === 'none') {
      inputSinceShow = false;
      if (docksLeftCovered.has(win)) {
        show = 'covered';
        return false;
      }
      // A field outside the dock: the browser reveals that field, and the
      // dock follows what is left of the cover.
      if (!ownsFocus()) {
        followDeficit();
        show = 'other';
        return true;
      }
      if (isRevealed(pan, height)) {
        show = 'revealed';
        return true;
      }
      show = 'watching';
      capTimer = setTimeout(() => {
        capTimer = null;
        if (show === 'watching') {
          settle(true);
        }
      }, DOCK_REVEAL_CAP_MS);
      restartSettle();
      return true;
    }
    if (show === 'watching') {
      if (isRevealPan(pan, height)) {
        clearTimers();
        show = 'revealed';
      } else if (panned) {
        restartSettle();
      }
      return true;
    }
    // The module's own put-back measures from the opening report, before the
    // lift moved the layout. So this show puts a pan to the dock back itself.
    if (show === 'covered' && isClassifying) {
      if (isRevealPan(pan, height) && pan > coveredPan + 0.5) {
        putBackTo(coveredPan);
      }
      return true;
    }
    return show !== 'covered';
  };
  return {
    report,
    input: markInput,
    stop: () => {
      clearTimers();
      stopWheels();
    },
  };
}

/**
 * Some browsers reveal a focused field themselves, after the keyboard's
 * report, by panning the visual viewport to it while the keyboard still
 * covers it. Firefox for Android pans 54 to 143 ms after the report. Chrome
 * on Android animates a pan of the keyboard's whole height from about 100 to
 * 170 ms after it. The page gets no frame until that pan ends. Such a pan
 * moves the visual viewport down within the
 * layout viewport. Since the report there is no touch, document scroll or
 * zoom, and a text field the caller owns has focus. The watch reads the
 * behavior, never the user agent. The caller lands its field itself and
 * puts the pan back. Every keyboard-aware surface can use it.
 *
 * @example
 * ```
 * const watch = watchRevealPan(window, {owns: field => region.contains(field)});
 * // On a report that changes the height: watch.report();
 * // On any later report: if (watch.isRevealPan(height)) watch.putBack();
 * ```
 */
export function watchRevealPan(
  win: Window,
  {owns, onTouch, dock = false}: WatchRevealPanOptions,
): RevealPanWatch {
  const doc = win.document;
  let atReport: {x: number; y: number; top: number; scale: number} | null =
    null;
  // Pans the visual viewport back to `top`, without scrolling the document. It
  // scrolls `anchor` into view, or a probe fixed at `top` in the layout
  // viewport, which the pan does not move.
  const putBackTo = (top: number, anchor?: Element | null) => {
    const options: ScrollIntoViewOptions = {
      block: 'start',
      inline: 'nearest',
      behavior: 'instant',
    };
    if (anchor != null) {
      anchor.scrollIntoView(options);
      return;
    }
    const probe = doc.createElement('div');
    probe.style.position = 'fixed';
    probe.style.left = '0';
    probe.style.top = `${top}px`;
    probe.style.width = '1px';
    probe.style.height = '1px';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    (doc.body ?? doc.documentElement).append(probe);
    probe.scrollIntoView(options);
    probe.remove();
  };
  const dockWatch = dock ? watchDock(win, owns, top => putBackTo(top)) : null;
  let touchedSinceReport = false;
  const stopTouchStarts = watchTouchStarts(doc, () => {
    touchedSinceReport = true;
    dockWatch?.input();
    onTouch?.();
  });
  return {
    report: () => {
      const viewport = win.visualViewport;
      atReport =
        viewport == null
          ? null
          : {
              x: win.scrollX,
              y: win.scrollY,
              top: viewport.offsetTop,
              scale: viewport.scale,
            };
      touchedSinceReport = false;
    },
    isRevealPan: height => {
      const viewport = win.visualViewport;
      const focused = doc.activeElement;
      return (
        viewport != null &&
        atReport != null &&
        !touchedSinceReport &&
        height > 0 &&
        viewport.offsetTop > atReport.top &&
        viewport.scale === atReport.scale &&
        win.scrollX === atReport.x &&
        win.scrollY === atReport.y &&
        focused instanceof HTMLElement &&
        isTextEntryControl(focused) &&
        owns(focused)
      );
    },
    putBack: anchor => putBackTo(atReport?.top ?? 0, anchor),
    dockReport: height => dockWatch?.report(height) ?? false,
    stop:
      dockWatch == null
        ? stopTouchStarts
        : () => {
            stopTouchStarts();
            dockWatch.stop();
          },
  };
}

/** The caller's rules for claimTapFocus. */
export interface ClaimTapFocusOptions {
  /** The control a touch on `target` would focus, when this caller claims it. */
  claim: (target: EventTarget | null) => HTMLElement | null;
  /**
   * Focuses the claimed control for a tap that ended at (x, y) in the
   * viewport. `touch` is the tap's finger: its screen point and identifier.
   */
  deliver: (
    control: HTMLElement,
    x: number,
    y: number,
    touch: {screenX: number; screenY: number; identifier: number},
  ) => void;
}

/**
 * The tap route. `deliver` focuses a one-finger tap on `region` that `claim`
 * accepts, such as a field without focus, instead of the browser. The
 * browser's own focus would reveal the field by scrolling the document. The
 * route prevents the tap's default at its end. The shared click guard then
 * takes the mouse events Safari may still send for the tap. The browser keeps a
 * touch that moves past the scroll slop, and a second finger. Returns a
 * cleanup.
 *
 * @example
 * ```
 * const stop = claimTapFocus(region, {
 *   claim: target => editableWithoutFocus(target),
 *   deliver: (field, x, y) => focusAtPoint(field, x, y),
 * });
 * ```
 */
export function claimTapFocus(
  region: HTMLElement,
  {claim, deliver}: ClaimTapFocusOptions,
): () => void {
  // The touch the route follows, and the listeners that follow it: on the
  // region only, and only while that touch is down.
  let start: {x: number; y: number; control: HTMLElement} | null = null;
  // On the iOS simulator, a tap held about 250 ms still gets its mousedown and
  // click. They come a few ms after its touchend, though the route cancelled
  // that touchend. They go to whatever is under the finger by then, which can
  // take the focus the tap delivered. The click guard takes them
  // (utils/clickGuard.ts).
  const stopFollowing = () => {
    start = null;
    region.removeEventListener('touchmove', onMove);
    region.removeEventListener('touchend', onEnd);
    region.removeEventListener('touchcancel', stopFollowing);
  };
  function onMove(event: TouchEvent) {
    const touch = event.touches[0];
    if (
      start == null ||
      event.touches.length !== 1 ||
      touch == null ||
      // Past the press slop, the touch is the browser's to scroll, not a tap
      // on a field.
      Math.hypot(touch.clientX - start.x, touch.clientY - start.y) >
        PRESS_SLOP_PX
    ) {
      stopFollowing();
    }
  }
  function onEnd(event: TouchEvent) {
    const touch = event.changedTouches[0];
    const tap = start;
    stopFollowing();
    // Still the same field, still without focus.
    if (
      tap == null ||
      touch == null ||
      !event.cancelable ||
      claim(tap.control) !== tap.control
    ) {
      return;
    }
    event.preventDefault();
    deliver(tap.control, touch.clientX, touch.clientY, touch);
    armClickGuard(region.ownerDocument, {takesLateMouse: true});
  }
  const onStart = (event: TouchEvent) => {
    if (start != null) {
      // Another finger joined the one the route follows: not a tap.
      stopFollowing();
      return;
    }
    const touch = event.touches[0];
    const control =
      event.touches.length === 1 && touch != null ? claim(event.target) : null;
    if (control == null || touch == null) {
      return;
    }
    start = {x: touch.clientX, y: touch.clientY, control};
    region.addEventListener('touchmove', onMove, {passive: true});
    // Not passive: only the end of the touch can still cancel the browser's
    // focus and its reveal.
    region.addEventListener('touchend', onEnd);
    region.addEventListener('touchcancel', stopFollowing);
  };
  region.addEventListener('touchstart', onStart, {passive: true});
  return () => {
    stopFollowing();
    region.removeEventListener('touchstart', onStart);
  };
}

function isTextControl(
  element: Element,
): element is HTMLTextAreaElement | HTMLInputElement {
  return (
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLInputElement
  );
}

/**
 * A text control's caret for a tap at (x, y). It is where the browser maps
 * the point inside the control. Where the browser maps none, it is after the
 * text, the convention for a focus without a point. A control with no text
 * selection stays as it is.
 */
function placeTextControlCaret(
  control: HTMLTextAreaElement | HTMLInputElement,
  x: number,
  y: number,
) {
  if (control.selectionStart == null) {
    return;
  }
  const caret = caretAt(control.ownerDocument, x, y, []);
  const offset =
    caret != null && caret.node === control
      ? caret.offset
      : control.value.length;
  control.setSelectionRange(offset, offset);
}

/**
 * Focuses without Safari's reveal and puts the caret under the finger.
 * Exported for its tests.
 */
export function focusAtPoint(editable: HTMLElement, x: number, y: number) {
  editable.focus({preventScroll: true});
  if (isTextControl(editable)) {
    placeTextControlCaret(editable, x, y);
    return;
  }
  const doc = editable.ownerDocument;
  const caret = caretAt(doc, x, y, []);
  if (
    caret != null &&
    editable.isContentEditable &&
    editable.contains(caret.node)
  ) {
    const range = doc.createRange();
    range.setStart(caret.node, caret.offset);
    range.collapse(true);
    const selection = doc.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
}
