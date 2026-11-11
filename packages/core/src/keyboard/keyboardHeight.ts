// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file keyboardHeight.ts
 * @input The visual viewport, the window's input stream (focus, blur,
 *   resize, scroll and touch), the layout viewport's height and the root's
 *   box
 * @output The on-screen keyboard module: measureKeyboardHeight,
 *   isKeyboardMeasurable, hasVirtualKeyboard, subscribeKeyboardHeight,
 *   getKeyboardHeight, getResizedRoom,
 *   isTextEntryControl, findTextEntryControl, refuseFocusReveal,
 *   watchRevealPan and panVisualViewportTo
 * @position Core's one source for the on-screen keyboard. It is internal to
 *   core and never exported from the package.
 *
 * SYNC: When modified, update /packages/core/src/keyboard/README.md
 */

import {armClickGuard} from '../utils/clickGuard';
import {matchesMediaQuery} from '../utils/coarsePointer';
import {getTouches, subscribeInput} from '../utils/inputStream';
import {deepActiveElement} from '../utils/flatTree';
import {isNode} from '../utils/nodeType';
import {layoutViewportHeight} from '../utils/layoutViewport';
import {PRESS_SLOP_PX} from '../utils/pressGesture';
import {caretAt} from '../utils/selectionLock';
import {sharedWeakMap} from '../utils/sharedRealm';

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
 * browser has made the room itself. A focused field still keeps its clearance
 * above the layout viewport's new bottom (getResizedRoom).
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
  const viewport = win.visualViewport;
  if (viewport == null || !isKeyboardMeasurable(win)) {
    return 0;
  }
  const height =
    layoutViewportHeight(win) - viewport.height * (viewport.scale ?? 1);
  return height > KEYBOARD_EPSILON ? Math.round(height * 100) / 100 : 0;
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
  /** The input stream's touch starts at the last hide, or null before one. */
  startsAtHide: number | null;
  /** The room the browser made by shrinking the root's box (getResizedRoom). */
  room: number;
  /** The root's box width at the last report that measured the room. */
  rootWidth: number;
  /**
   * The tallest the root's box has been at each width it had. The store keeps
   * them across subscriptions, so a turn of the phone and back keeps the room.
   */
  rootTallest: Map<number, number>;
  listeners: Set<(event: KeyboardHeightEvent) => void>;
  /** The subscribers that asked for focus moves too (the layout guide). */
  focusListeners: Set<(event: KeyboardHeightEvent) => void>;
  detach: (() => void) | null;
  detachFocus: (() => void) | null;
}

const stores = sharedWeakMap<Window, KeyboardStore>(
  'keyboard/keyboard-height/stores',
  1,
);

function storeOf(win: Window): KeyboardStore {
  let store = stores.get(win);
  if (store == null) {
    store = {
      height: 0,
      startsAtHide: null,
      room: 0,
      rootWidth: 0,
      rootTallest: new Map(),
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

// The root's box. Chrome on Android keeps it at the viewport with its toolbar
// shown, and `interactive-widget=resizes-content` shrinks it with the
// keyboard. So the toolbar's moves change `innerHeight`, but not this room.
function measureResizedRoom(
  win: Window,
  store: KeyboardStore,
  keyboardHeight: number,
): number {
  if (!isKeyboardMeasurable(win)) {
    return 0;
  }
  const root = win.document.documentElement;
  const height = root.clientHeight;
  // A root with no box yet, as before layout, makes no room.
  if (!(height > 0)) {
    return 0;
  }
  const width = root.clientWidth;
  store.rootWidth = width;
  const tallest = store.rootTallest.get(width) ?? 0;
  if (height > tallest) {
    store.rootTallest.set(width, height);
    return 0;
  }
  if (keyboardHeight > KEYBOARD_EPSILON) {
    return 0;
  }
  // A window that gets shorter with no text entry focused, as in Android's
  // split screen, makes no room for a keyboard.
  const room = tallest - height;
  return room > KEYBOARD_EPSILON &&
    isTextEntryControl(deepActiveElement(win.document))
    ? room
    : 0;
}

function attach(win: Window, store: KeyboardStore): () => void {
  const viewport = win.visualViewport;
  store.height = measureKeyboardHeight(win);
  store.room = measureResizedRoom(win, store, store.height);
  // Set while a step of a hide waits. The store keeps the height it reported,
  // so every reader lays out once, when the keyboard comes to rest.
  let stepTimer: ReturnType<typeof setTimeout> | null = null;
  let stepHeight = 0;
  let stepLimit = 0;
  const deliver = (height: number, timeStamp: number) => {
    const wasUp =
      store.height > KEYBOARD_EPSILON || store.room > KEYBOARD_EPSILON;
    store.height = height;
    store.room = measureResizedRoom(win, store, height);
    if (wasUp && height <= KEYBOARD_EPSILON && store.room <= KEYBOARD_EPSILON) {
      store.startsAtHide = getTouches(win).starts;
    }
    const report: KeyboardHeightEvent = {type: 'viewport', height, timeStamp};
    for (const listener of [...store.listeners]) {
      listener(report);
    }
  };
  const onViewport = (event: Event) => {
    const height = measureKeyboardHeight(win);
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
          deliver(measureKeyboardHeight(win), win.performance.now());
        },
        Math.min(HIDE_STEP_WAIT_MS, stepLimit - now),
      );
      return;
    }
    if (stepTimer != null) {
      clearTimeout(stepTimer);
      stepTimer = null;
    }
    deliver(height, event.timeStamp);
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
 * Whether a finger is on `win`'s screen, from the input stream's count. A
 * finger that was down at the keyboard's last hide counts no more until a
 * touch starts. A touch whose target leaves the page ends at a node the
 * window never hears.
 */
export function isFingerOnScreen(win: Window): boolean {
  const startsAtHide = stores.get(win)?.startsAtHide;
  const touches = getTouches(win);
  return (
    touches.fingers > 0 &&
    (startsAtHide == null || touches.starts !== startsAtHide)
  );
}

/** The room a browser makes for the keyboard, and the width it is read at. */
export interface ResizedRoom {
  /** The room, CSS px. */
  readonly room: number;
  /** The root's box width the room is measured at, CSS px. */
  readonly width: number;
}

/**
 * The room the browser makes for the keyboard by shrinking the layout
 * viewport, CSS px. Chrome on Android does so under
 * `interactive-widget=resizes-content`, where the keyboard height reads 0.
 * It is how far the root's box is short of the tallest it has been at the
 * same width. The toolbar's moves leave the root's box as it is. The room is
 * 0 while the visual viewport measures a keyboard. While the module listens,
 * it is the room measured at the last report, so every reader shares that one
 * layout read. The module keeps the tallest box per width across
 * subscriptions. A width first measured with such a keyboard up reads 0 until
 * that keyboard goes. That happens after a turn of the phone, or for a
 * window's first reader.
 *
 * It comes with the root's box width it is measured at. While the module
 * listens, that width is the one read with the room at the last report, so
 * it adds no layout read.
 *
 * @example
 * ```
 * const isKeyboardUp =
 *   getKeyboardHeight(window) > 0 || getResizedRoom(window).room > 0;
 * const hasTurned = getResizedRoom(window).width !== widthAtReveal;
 * ```
 */
export function getResizedRoom(win: Window): ResizedRoom {
  const store = storeOf(win);
  if (store.detach != null) {
    return {room: store.room, width: store.rootWidth};
  }
  const room = measureResizedRoom(win, store, measureKeyboardHeight(win));
  return {room, width: win.document.documentElement.clientWidth};
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
const focusTakeovers = sharedWeakMap<
  Document,
  {
    stop: () => void;
    callers: Set<(event: FocusEvent) => void>;
  }
>('keyboard/keyboard-height/focus-takeovers', 1);

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

/** The caller's rules for watchRevealPan. */
export interface WatchRevealPanOptions {
  /** Whether the focused field is the caller's to keep in view. */
  owns: (focused: HTMLElement) => boolean;
  /** Called on every touch start, which ends the watch for the report. */
  onTouch?: () => void;
  /**
   * Whether a document scroll can be part of the browser's reveal, which
   * `putBack` then scrolls back too. Set it for a fixed field in Chrome on
   * Android. Its reveal centres the field's document position, then pans as far
   * as the keyboard's room allows. Only a match counts. Keep it false where
   * Safari runs: it carries out an app's document scroll as an offset.
   */
  documentScrollIsReveal?: boolean;
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
   * With `documentScrollIsReveal`, it first scrolls the document back too.
   */
  putBack: (anchor?: Element | null) => void;
  /** Ends the watch; the shared touch subscription goes with the last watch. */
  stop: () => void;
}

// One shared touch subscription per document serves every reveal-pan watch
// in it, so no instance adds a listener. The first watch adds it, and the
// last removes it.
const touchStartWatches = sharedWeakMap<
  Document,
  {stop: () => void; watches: Set<() => void>}
>('keyboard/keyboard-height/touch-start-watches', 1);

function watchTouchStarts(doc: Document, onTouchStart: () => void): () => void {
  let shared = touchStartWatches.get(doc);
  if (shared == null) {
    const view = doc.defaultView;
    if (view == null) {
      return () => {};
    }
    const watches = new Set<() => void>();
    const stopStarts = subscribeInput(view, 'touchstart', () => {
      for (const watch of [...watches]) {
        watch();
      }
    });
    // Heard so the stream counts the fingers on the screen (isFingerOnScreen).
    const stopEnds = subscribeInput(view, 'touchend', () => {});
    const stopCancels = subscribeInput(view, 'touchcancel', () => {});
    shared = {
      stop: () => {
        stopStarts();
        stopEnds();
        stopCancels();
      },
      watches,
    };
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

/**
 * Some browsers reveal a focused field themselves, after the keyboard's
 * report, by panning the visual viewport to it while the keyboard still
 * covers it. Firefox for Android pans 54 to 143 ms after the report. Chrome
 * on Android animates a pan of the keyboard's whole height from about 100 to
 * 170 ms after it. The page gets no frame until that pan ends. Such a pan
 * moves the visual viewport down within the
 * layout viewport. Since the report there is no touch, document scroll or
 * zoom, and a text field the caller owns has focus. In Chrome, a reveal of a
 * field in a fixed container also scrolls the document first. The watch reads
 * the behavior, never the user agent. The caller lands its field itself and
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
  {owns, onTouch, documentScrollIsReveal = false}: WatchRevealPanOptions,
): RevealPanWatch {
  const doc = win.document;
  let atReport: {x: number; y: number; top: number; scale: number} | null =
    null;
  let touchedSinceReport = false;
  // Whether a scroll is Chrome's reveal. The watch decides it once per report
  // and after each put-back, so later scrolls read no layout.
  let isChromeReveal: boolean | null = null;
  const stopTouchStarts = watchTouchStarts(doc, () => {
    touchedSinceReport = true;
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
      // A report while a finger is down, as when Firefox's toolbar hides in
      // a drag, leaves that drag's pan to the person.
      touchedSinceReport = isFingerOnScreen(win);
      isChromeReveal = null;
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
        focused instanceof HTMLElement &&
        isTextEntryControl(focused) &&
        owns(focused) &&
        ((win.scrollX === atReport.x && win.scrollY === atReport.y) ||
          (documentScrollIsReveal &&
            (isChromeReveal ??= isCentringReveal(
              win,
              viewport,
              focused,
              atReport,
            ))))
      );
    },
    putBack: anchor => {
      isChromeReveal = null;
      const options: ScrollIntoViewOptions = {
        block: 'start',
        inline: 'nearest',
        behavior: 'instant',
      };
      if (
        documentScrollIsReveal &&
        atReport != null &&
        (win.scrollX !== atReport.x || win.scrollY !== atReport.y)
      ) {
        win.scrollTo({
          left: atReport.x,
          top: atReport.y,
          behavior: 'instant',
        });
      }
      if (anchor != null) {
        anchor.scrollIntoView(options);
        return;
      }
      panVisualViewportTo(win, atReport?.top ?? 0);
    },
    stop: stopTouchStarts,
  };
}

// How far a scroll or a pan may sit from Chrome's reveal: rounding.
const CENTRING_SLACK_PX = 2;

// Whether the scroll and the pan since the report match Chrome's reveal of a
// fixed `field` (documentScrollIsReveal), not an app's scroll elsewhere.
function isCentringReveal(
  win: Window,
  viewport: VisualViewport,
  field: HTMLElement,
  atReport: {x: number; y: number},
): boolean {
  const box = field.getBoundingClientRect();
  const centring = (box.top + box.bottom) / 2 - viewport.height / 2;
  const root = win.document.scrollingElement ?? win.document.documentElement;
  const range = root.scrollHeight - root.clientHeight;
  const room = layoutViewportHeight(win) - viewport.height;
  const scroll = Math.min(range, Math.max(0, atReport.y + centring));
  const pan = Math.min(room, Math.max(0, centring));
  return (
    win.scrollX === atReport.x &&
    Math.abs(win.scrollY - scroll) <= CENTRING_SLACK_PX &&
    Math.abs(viewport.offsetTop - pan) <= CENTRING_SLACK_PX
  );
}

/**
 * Pans the visual viewport so its top sits `top` CSS px down the layout
 * viewport, without scrolling the document. A probe fixed there is scrolled
 * into view. In Chrome for Android this pans the visual viewport. In Firefox
 * for Android it pans nothing where the page has no scroll range. The pan
 * reaches the room the keyboard takes, which a document scroll cannot.
 *
 * @example
 * ```
 * panVisualViewportTo(window, window.visualViewport.offsetTop + 120);
 * ```
 */
export function panVisualViewportTo(win: Window, top: number): void {
  const doc = win.document;
  const probe = doc.createElement('div');
  probe.style.position = 'fixed';
  probe.style.left = '0';
  probe.style.top = `${top}px`;
  probe.style.width = '1px';
  probe.style.height = '1px';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  (doc.body ?? doc.documentElement).append(probe);
  probe.scrollIntoView({
    block: 'start',
    inline: 'nearest',
    behavior: 'instant',
  });
  probe.remove();
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
