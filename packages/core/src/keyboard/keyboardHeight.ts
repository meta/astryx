// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file keyboardHeight.ts
 * @input The visual viewport, the window's input stream (focus, blur,
 *   resize, scroll and touch), and the layout viewport's height
 * @output The on-screen keyboard module: measureKeyboardHeight,
 *   isKeyboardMeasurable, subscribeKeyboardHeight, getKeyboardHeight,
 *   isTextEntryControl, findTextEntryControl, refuseFocusReveal and
 *   watchRevealPan
 * @position Core's one source for the on-screen keyboard. It is internal to
 *   core and never exported from the package.
 *
 * SYNC: When modified, update /packages/core/src/keyboard/README.md
 */

import {subscribeInput} from '../utils/inputStream';
import {layoutViewportHeight} from '../utils/layoutViewport';

// A shortfall smaller than this is rounding, not a keyboard.
export const KEYBOARD_EPSILON = 1;
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
  listeners: Set<(event: KeyboardHeightEvent) => void>;
  /** The subscribers that asked for focus moves too (the layout guide). */
  focusListeners: Set<(event: KeyboardHeightEvent) => void>;
  detach: (() => void) | null;
  detachFocus: (() => void) | null;
}

const stores = new WeakMap<Window, KeyboardStore>();

// A window's capture phase also hears its document's events. A window's own
// event has no node as its target.
export function isNodeTarget(target: EventTarget | null): boolean {
  return target != null && typeof (target as Node).nodeType === 'number';
}

function storeOf(win: Window): KeyboardStore {
  let store = stores.get(win);
  if (store == null) {
    store = {
      height: 0,
      listeners: new Set(),
      focusListeners: new Set(),
      detach: null,
      detachFocus: null,
    };
    stores.set(win, store);
  }
  return store;
}

function attach(win: Window, store: KeyboardStore): () => void {
  const viewport = win.visualViewport;
  store.height = measureKeyboardHeight(win);
  const onViewport = (event: Event) => {
    store.height = measureKeyboardHeight(win);
    const report: KeyboardHeightEvent = {
      type: 'viewport',
      height: store.height,
      timeStamp: event.timeStamp,
    };
    for (const listener of [...store.listeners]) {
      listener(report);
    }
  };
  viewport?.addEventListener('resize', onViewport);
  viewport?.addEventListener('scroll', onViewport);
  // Only the window's own resize reports.
  const stopResize = subscribeInput(win, 'resize', event => {
    if (!isNodeTarget(event.target)) {
      onViewport(event);
    }
  });
  return () => {
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
      if (isNodeTarget(event.target)) {
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
  {owns, onTouch}: WatchRevealPanOptions,
): RevealPanWatch {
  const doc = win.document;
  let atReport: {x: number; y: number; top: number; scale: number} | null =
    null;
  let touchedSinceReport = false;
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
    putBack: anchor => {
      const options: ScrollIntoViewOptions = {
        block: 'start',
        inline: 'nearest',
        behavior: 'instant',
      };
      if (anchor != null) {
        anchor.scrollIntoView(options);
        return;
      }
      // A fixed element sits in the layout viewport, which the pan does not
      // move: scrolling its top into view pans the visual viewport back.
      const probe = doc.createElement('div');
      probe.style.position = 'fixed';
      probe.style.left = '0';
      probe.style.top = `${atReport?.top ?? 0}px`;
      probe.style.width = '1px';
      probe.style.height = '1px';
      probe.style.visibility = 'hidden';
      probe.style.pointerEvents = 'none';
      (doc.body ?? doc.documentElement).append(probe);
      probe.scrollIntoView(options);
      probe.remove();
    },
    stop: stopTouchStarts,
  };
}
