// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file GestureHost.ts
 * @input DOM touch, pointer, click, contextmenu, scroll and focus events of
 *   one document; elements with recognizers and consumers attached, and
 *   consumer types found by attribute
 * @output Exports GestureHost (the DOM side of the gesture system),
 *   getGestureHost (one host per document) and the delegated consumer type
 * @position Browser adapter of packages/core/src/gestures: turns real events
 *   into GestureArena input, and carries out what the arena decides
 *
 * FOR EVERY POINTER
 *
 * - Recognizers and press consumers attach for a mouse, a pen and a finger
 *   alike (`spec:AST-094` FR43, FR19). Where the primary pointer is coarse
 *   the host listens on the page while something enabled could take a
 *   touch. Where it is fine, each element with an enabled recognizer or
 *   consumer keeps one passive `pointerdown` listener and the page has none:
 *   a press on it (a mouse's primary button, a pen, or a finger, whose
 *   `pointerdown` comes before its `touchstart`) installs the host's page
 *   listeners, which go once that press's contacts end; the click listener
 *   alone stays through the swallower's window, for the click a claimed lift
 *   owes (FR21, FR24). An element whose recognizer claims a moving finger
 *   keeps its blocking `touchmove` under every pointer, a listener FR24
 *   counts apart.
 * - A right click, a pen's barrel button and a ctrl-click on macOS start no
 *   press (primaryClick.ts).
 * - The host follows the primary pointer (a tablet docking a mouse): turning
 *   fine with no press held removes the page listeners and cancels every
 *   touch in flight.
 * - A delegated consumer type has no element to listen on: where the
 *   primary pointer is fine, the document keeps one passive `pointerdown`
 *   listener for every type, counted once per page (FR24).
 *
 * INPUT CHANNELS
 *
 * - Fingers begin and end with Touch Events: they are the only cancelable
 *   channel (a pointer event's preventDefault cannot stop a scroll or a
 *   click), they keep arriving after the browser takes a pan (which a scroll
 *   handoff needs), and every event lists all the fingers at once. A
 *   finger's movement comes from BOTH its `touchmove`s and its
 *   `pointermove`s (paired at touchstart by target and position), the echo
 *   of one in the other dropped: Chromium sends no `touchmove` until a
 *   finger has travelled about 16 px, while a tap fails and a pan begins at
 *   10.
 * - A finger's events go to the element it landed on even after that
 *   element leaves the document, and then never reach the document. Each
 *   tracked finger's target therefore gets its own listeners, and a finger
 *   the events say is no longer down is cancelled, so a re-rendered or
 *   removed target never strands a gesture.
 * - Mice and pens come from Pointer Events, with coalesced samples for
 *   velocity. A pen on an iPad also produces `stylus` touches; those are left
 *   to the pointer path.
 * - `pointercancel` on a finger is the browser saying it took that finger
 *   for its own pan or zoom; so is a `touchmove` that can no longer be
 *   cancelled where `touch-action` let the browser pan, and a scroll above
 *   the touch.
 *
 * WHAT THE BROWSER IS TOLD
 *
 * - Each element gets the `touch-action` its recognizers leave the browser
 *   (touchAction.ts), set inline when they attach and restored when they
 *   detach.
 * - Each element with a recognizer that can claim a touch while it moves (a
 *   pan, a swipe, a long press that then drags, a pinch) gets a
 *   NON-passive `touchmove` listener that cancels the event only while a
 *   recognizer owns one of its touches (a pan claims when it begins, at
 *   UIKit's 10 pt, `spec:AST-094` FR17). Nothing else is ever cancelled, so a
 *   touch nobody claims scrolls exactly as it would without the system. The
 *   known cost: a scroll that BEGINS on such an element waits for a busy main
 *   thread (measured in iOS Safari; a passive listener would hand every
 *   diagonal to the scroll instead). Elements whose recognizers only claim
 *   at the lift (taps) and press consumers get no blocking listener, so a
 *   scroll starting on them never waits.
 * - A lift whose click must not happen cancels its `touchend` (no click, no
 *   compatibility mouse events) and arms a one-shot swallower for the next
 *   trusted click; a click held for a recognizer that may still recognize is
 *   replayed if they all fail. Keyboard and assistive-technology clicks
 *   (`detail === 0`) always pass.
 * - A `contextmenu` while a recognizer owns a touch is cancelled, so a long
 *   press never also opens the browser's menu.
 *
 * DELEGATED CONSUMERS. A consumer type registered with an attribute (a
 * pressable row) is found at touch-down by walking up from the touch target,
 * and an instance is created for that one touch: a list of a thousand rows
 * costs nothing until a finger lands on one.
 *
 * SSR-safe: nothing touches `window` or `document` until something attaches.
 *
 * SYNC: When modified, update GestureHost.test.ts and README.md.
 */

import {UIKIT_GESTURES} from '../motion/uikit/gestures';
import {
  browserClock,
  GestureArena,
  type ArenaBeganInput,
  type ClickDisposition,
  type GestureArenaOptions,
  type GestureClock,
} from './GestureArena';
import type {GestureRecognizer} from './GestureRecognizer';
import {HAPTIC_SWITCH_ATTRIBUTE} from './haptics';
import {isPrimaryClick} from '../utils/primaryClick';
import {createNativeScrollProbe, parentAcrossShadow} from './nativeScroll';
import {
  gestureHostStyle,
  type GestureHostStyle,
  holdSelectionStyle,
  intersectTouchAction,
} from './touchAction';
import {
  markTouchAction,
  TOUCH_ACTION_ATTRIBUTE,
  unmarkTouchAction,
} from './touchActionRule';
import type {ScreenEdgePanGestureRecognizer} from './ScreenEdgePanGestureRecognizer';
import type {
  GestureEnvironment,
  GestureTouch,
  PointerKind,
  TouchBeganInput,
  TouchConsumer,
  TouchInput,
  TouchSample,
} from './types';

interface Registration {
  readonly recognizers: GestureRecognizer[];
  consumer: TouchConsumer | null;
  touchMoveListener: EventListener | null;
  /**
   * Under `inputMode: 'pointer-events'`, the element's blocking `touchend`
   * listener: it cancels a claimed finger's lift (`spec:AST-094` FR21).
   */
  touchEndListener: EventListener | null;
  /** Inline values the host replaced, to restore on detach. */
  readonly savedStyle: Map<string, string>;
  /**
   * What the element's own stylesheet gives it, read in a frame for the
   * derived value the host marked then: `null` where the host's rule is in
   * force (the author sets nothing else); the host never allows more than
   * the author does. `null` before the read.
   */
  authorTouchAction: {derived: string; author: string | null} | null;
  manageStyle: boolean;
  /** An action group (`family:action-groups` FR5). */
  actionGroup: boolean;
}

export interface GestureHostOptions {
  /** The arena's clock; tests pass a manual one. */
  clock?: GestureClock;
  /**
   * Where fingers come from: Touch Events where the browser has them
   * (`auto`), or Pointer Events only.
   */
  inputMode?: 'auto' | 'pointer-events';
  /** Every recognizer transition, for debugging and tests. */
  onTransition?: GestureArenaOptions['onTransition'];
  /**
   * Whether the primary pointer is coarse (a phone, a tablet). Gestures
   * attach for every pointer (`spec:AST-094` FR43); where it is fine, an
   * element that uses a gesture keeps one passive `pointerdown` listener
   * (beside a claiming recognizer's blocking `touchmove`, FR19) and the
   * page's listeners last only a press (FR24).
   * @default `(pointer: coarse)` on the document's window
   */
  isPrimaryPointerCoarse?: () => boolean;
}

export interface AttachOptions {
  /**
   * Let the host set the element's styles: its `touch-action`, and the
   * selection and callout lock a hold that does something keeps while it is
   * held (`spec:AST-094` FR41). With false the caller keeps both.
   * @default true
   */
  manageStyle?: boolean;
  /**
   * The element is an action group, sibling actions a held pointer slides
   * across (`family:action-groups` FR5). It is served like every
   * attachment, for every pointer (`spec:AST-094` FR43). @default false
   */
  actionGroup?: boolean;
}

/**
 * A kind of view-level consumer found by attribute instead of attached to
 * each element.
 */
export interface DelegatedConsumerType {
  /** Marks an element as this kind of consumer. */
  readonly attribute: string;
  /**
   * The consumer for one contact on `element`, or null for none (a disabled
   * control). The innermost marked element decides, even with null: a press
   * on a disabled button does not light the row around it.
   */
  create(element: Element, pointerType: PointerKind): TouchConsumer | null;
}

const STYLE_PROPERTIES: Record<keyof GestureHostStyle, string> = {
  touchAction: 'touch-action',
  WebkitTouchCallout: '-webkit-touch-callout',
  WebkitUserSelect: '-webkit-user-select',
  userSelect: 'user-select',
};

/**
 * Whether a recognizer can take a touch while it moves, and so needs the
 * blocking `touchmove` listener that stops the browser's pan. A tap claims
 * only at the lift (it fails once the finger travels), so it needs none.
 */
function claimsWhileMoving(recognizer: GestureRecognizer): boolean {
  return recognizer.acceptsTouchInput && recognizer.kind !== 'tap';
}

/**
 * A CSS-wide keyword, which names no touch-action of its own: the value in
 * force resolves it (`initial` and `unset` to `auto`, `inherit` to the
 * parent's).
 */
function isCssWideKeyword(value: string): boolean {
  return CSS_WIDE_KEYWORDS.has(value.trim().toLowerCase());
}

const CSS_WIDE_KEYWORDS: ReadonlySet<string> = new Set([
  'initial',
  'inherit',
  'unset',
  'revert',
  'revert-layer',
]);

/**
 * Run `task` in the next frame, before it paints: a read there styles what
 * the frame must style anyway, and its writes are what the frame shows.
 */
function inNextFrame(view: Window | null, task: () => void): void {
  if (view != null && typeof view.requestAnimationFrame === 'function') {
    view.requestAnimationFrame(task);
  } else {
    setTimeout(task, 0);
  }
}

const PASSIVE_CAPTURE = {capture: true, passive: true} as const;

/**
 * A screen-edge pan, told apart by its kind (architecture:react-component-runtime
 * INV13), so the host can report its layout changes without importing it.
 */
function asScreenEdgePan(
  recognizer: GestureRecognizer,
): ScreenEdgePanGestureRecognizer | null {
  return recognizer.kind === 'screenEdgePan'
    ? (recognizer as ScreenEdgePanGestureRecognizer)
    : null;
}

/** The inline properties a held press sets to none (holdSelectionStyle). */
const HOLD_SELECTION_PROPERTIES = [
  '-webkit-touch-callout',
  '-webkit-user-select',
  'user-select',
] as const;

/** Elements a held press turned selection off on, and what to restore. */
const heldSelection = new WeakMap<
  HTMLElement,
  {
    count: number;
    saved: ReadonlyArray<{name: string; value: string; priority: string}>;
  }
>();
const ACTIVE_CAPTURE = {capture: true, passive: false} as const;

type StylusTouch = Touch & {touchType?: string};

interface PlacedContact {
  readonly x: number;
  readonly y: number;
  readonly target: unknown;
}

/** A touchstart and a pointerdown describe one finger: same target, same spot. */
function isSamePlace(a: PlacedContact, b: PlacedContact): boolean {
  return (
    a.target === b.target &&
    Math.abs(a.x - b.x) <= 1 &&
    Math.abs(a.y - b.y) <= 1
  );
}

function isPointerKind(type: string): type is PointerKind {
  return type === 'touch' || type === 'mouse' || type === 'pen';
}

/**
 * An event's time on the arena's clock (`performance.now()`). Some engines
 * and DOM emulators stamp events in epoch milliseconds instead.
 */
function eventTime(event: Event): number {
  const time = event.timeStamp;
  if (
    time > 1e12 &&
    typeof performance !== 'undefined' &&
    performance.timeOrigin > 0
  ) {
    return time - performance.timeOrigin;
  }
  return time;
}

/** A touch list as an array; a synthetic event may carry none. */
function touchesOf(list: TouchList | null | undefined): Touch[] {
  return list == null ? [] : Array.from(list);
}

export class GestureHost {
  readonly arena: GestureArena;
  private readonly doc: Document;
  private readonly registry = new Map<Element, Registration>();
  private readonly delegated = new Set<DelegatedConsumerType>();
  /** Touch.identifier → arena id, for live fingers. */
  private readonly touchIds = new Map<number, number>();
  /** Touch.identifier → the element the finger landed on. */
  private readonly touchTargets = new Map<number, EventTarget>();
  /**
   * Finger targets with listeners of their own: how many fingers each, and
   * how many of those a recognizer could claim while they move (only those
   * need the blocking `touchmove` listener).
   */
  private readonly watched = new Map<
    EventTarget,
    {count: number; blocking: number}
  >();
  /** Fingers whose target listener is the blocking one. */
  private readonly blockingFingers = new Set<number>();
  /** Touch events already handled (the document's and the target's listeners both see one). */
  private readonly processed = new WeakSet<Event>();
  /** pointerId → arena id, for live mouse and pen contacts. */
  private readonly pointerIds = new Map<number, number>();
  /** Elements whose caller touch-action waits for a read after paint. */
  private readonly pendingCallerReads = new Set<HTMLElement>();
  private isCallerReadScheduled = false;
  /**
   * The boxes the host watches for screen-edge pans (syncLayoutWatch): each
   * element with an enabled one, and the root for one whose band moves with
   * the viewport (spec:AST-094 FR18, FR19, DEC-22), and the one observer
   * that watches them.
   */
  private readonly layoutWatched = new Set<Element>();
  private layoutObserver: ResizeObserver | null = null;
  /** Fingers whose first uncancelable `touchmove` was already judged. */
  private readonly judgedUncancelable = new Set<number>();
  /**
   * A finger's pointerId → its arena id, once its pointerdown and its
   * touchstart are paired. Chromium sends no `touchmove` until a finger has
   * travelled its slop (about 16 px), but sends every `pointermove`, so the
   * finger's movement comes from both channels; and its `pointercancel` is
   * the browser's claim of exactly that finger.
   */
  private readonly fingerPointers = new Map<number, number>();
  /** Finger pointerdowns still waiting for their touchstart. */
  private readonly pendingPointers = new Map<number, PlacedContact>();
  /**
   * Under `inputMode: 'pointer-events'`, where claimed fingers lifted: the
   * `touchend` that follows their `pointerup` is cancelled (FR21).
   */
  private readonly claimedLifts: PlacedContact[] = [];
  /** Fingers still waiting for their pointerdown, by arena id. */
  private readonly unpairedTouches = new Map<number, PlacedContact>();
  /** The elements each held contact turned selection off on. */
  private readonly heldSelectionBy = new Map<number, HTMLElement[]>();
  private readonly isPrimaryPointerCoarse: () => boolean;
  private readonly coarseQuery: MediaQueryList | null;
  private isWatchingPointer = false;
  private readonly onPointerKindChange = (): void => this.refreshAll();
  /** The last position fed per contact, so one channel's echo is dropped. */
  private readonly lastFed = new Map<number, TouchSample>();
  /** When a finger was last down or lifted, and where it landed. */
  private lastTouch: {readonly target: Node; readonly time: number} | null =
    null;
  /** Scrollers a recognizer is scrolling itself this frame (ownScroll). */
  private readonly ownedScrolls = new Set<Node>();
  /** The last scroll a finger drove, and when. */
  private lastScroll: {readonly scroller: Node; readonly time: number} | null =
    null;
  private nextId = 1;
  private isInstalled = false;
  private readonly inputMode: 'auto' | 'pointer-events';
  private usesTouchEvents = true;
  private swallowDeadline = Number.NEGATIVE_INFINITY;
  /**
   * Where the primary pointer is fine: what listens for a press itself (the
   * elements that use a gesture, and the document for delegated consumers),
   * with its removal; whether a press one armed is held, the page's
   * listeners lasting that long; and the pending removal of the click
   * listener a released press kept (FR21, FR24).
   */
  private readonly armed = new Map<EventTarget, () => void>();
  private isArmedPress = false;
  private clickRemoval: ReturnType<typeof setTimeout> | null = null;

  constructor(doc: Document, options: GestureHostOptions = {}) {
    this.doc = doc;
    this.inputMode = options.inputMode ?? 'auto';
    const environment: GestureEnvironment = {
      viewportSize: () => ({
        width: doc.defaultView?.innerWidth ?? 0,
        height: doc.defaultView?.innerHeight ?? 0,
      }),
      isRtl: view =>
        view instanceof Element &&
        doc.defaultView?.getComputedStyle(view).direction === 'rtl',
      // A screen-edge pan tells a view within its edge band from any other
      // by its box (spec:AST-094 FR18).
      viewRect: view => {
        if (!(view instanceof Element)) {
          return null;
        }
        const {left, top, width, height} = view.getBoundingClientRect();
        return {left, top, width, height};
      },
    };
    this.arena = new GestureArena({
      clock: options.clock ?? browserClock,
      environment,
      onDeferredClick: (touch, allowed) => this.replayClick(touch, allowed),
      onTransition: options.onTransition,
    });
    const view = doc.defaultView;
    const coarseQuery =
      options.isPrimaryPointerCoarse == null &&
      typeof view?.matchMedia === 'function'
        ? view.matchMedia('(pointer: coarse)')
        : null;
    this.isPrimaryPointerCoarse =
      options.isPrimaryPointerCoarse ?? (() => coarseQuery?.matches ?? false);
    this.coarseQuery = coarseQuery;
  }

  /** Re-derive every element's styles and the host's listeners. */
  private refreshAll(): void {
    for (const [element, registration] of this.registry) {
      this.refresh(element, registration);
    }
    this.syncListeners();
  }

  // --- Attachment ------------------------------------------------------------

  /** Attach a recognizer to an element. Returns the detach function. */
  attach(
    element: Element,
    recognizer: GestureRecognizer,
    options: AttachOptions = {},
  ): () => void {
    const registration = this.registrationFor(element);
    registration.manageStyle = options.manageStyle ?? registration.manageStyle;
    registration.actionGroup = options.actionGroup ?? registration.actionGroup;
    recognizer.view = element;
    registration.recognizers.push(recognizer);
    recognizer.onEnabledChange = () => {
      this.refresh(element, registration);
      this.syncListeners();
    };
    const edgePan = asScreenEdgePan(recognizer);
    if (edgePan != null) {
      // A new answer may also move the band the pan watches onto or off the
      // right side, whose band moves with the viewport (an in-place switch
      // of direction): the layout watch follows (FR18, FR24, DEC-22).
      edgePan.onTouchBehaviorChange = () => {
        this.refresh(element, registration);
        this.syncLayoutWatch();
      };
    }
    this.refresh(element, registration);
    this.syncListeners();
    return () => {
      recognizer.onEnabledChange = null;
      if (edgePan != null) {
        edgePan.onTouchBehaviorChange = null;
      }
      const index = registration.recognizers.indexOf(recognizer);
      if (index >= 0) {
        registration.recognizers.splice(index, 1);
      }
      // A recognizer whose view goes away mid-gesture is cancelled, as in
      // UIKit when a view leaves the window.
      if (recognizer.state !== 'possible' || recognizer.isInvolved()) {
        recognizer.cancel();
      }
      this.refresh(element, registration);
      // Even when the element keeps other attachments: one left disabled
      // keeps no listener or observer (FR24).
      this.syncListeners();
      this.cleanup(element, registration);
    };
  }

  /**
   * Watch the box of each element with an enabled screen-edge pan, and the
   * root's for a pan that watches the right side, whose band moves with the
   * viewport: a resize may move an element into or out of its edge band, and
   * the pan then measures again and re-derives the element's touch-action
   * (FR19). The host sets touch-action for every pointer (FR43), so it
   * watches under any primary pointer. One ResizeObserver serves every
   * element and goes with the last one, and no listener is added (FR24); an
   * engine without ResizeObserver keeps each pan's first measurement.
   */
  private syncLayoutWatch(): void {
    const wanted = new Set<Element>();
    let watchesViewport = false;
    for (const [element, registration] of this.registry) {
      for (const recognizer of registration.recognizers) {
        const edgePan = asScreenEdgePan(recognizer);
        if (edgePan != null && edgePan.isEnabled) {
          wanted.add(element);
          watchesViewport ||= edgePan.watchesViewport;
        }
      }
    }
    if (watchesViewport) {
      wanted.add(this.doc.documentElement);
    }
    for (const element of [...this.layoutWatched]) {
      if (!wanted.has(element)) {
        this.layoutObserver?.unobserve(element);
        this.layoutWatched.delete(element);
      }
    }
    if (wanted.size === 0) {
      this.layoutObserver?.disconnect();
      this.layoutObserver = null;
      return;
    }
    const view = this.doc.defaultView;
    if (
      this.layoutObserver == null &&
      view != null &&
      typeof view.ResizeObserver === 'function'
    ) {
      this.layoutObserver = new view.ResizeObserver(this.onLayoutChange);
      for (const element of this.layoutWatched) {
        this.layoutObserver.observe(element);
      }
    }
    for (const element of wanted) {
      if (!this.layoutWatched.has(element)) {
        this.layoutObserver?.observe(element);
        this.layoutWatched.add(element);
      }
    }
  }

  /** A watched box or the root resized: each enabled edge pan measures again. */
  private readonly onLayoutChange = (): void => {
    for (const registration of this.registry.values()) {
      for (const recognizer of registration.recognizers) {
        const edgePan = asScreenEdgePan(recognizer);
        if (edgePan != null && edgePan.isEnabled) {
          edgePan.layoutChanged();
        }
      }
    }
  };

  /** Attach the view-level touch consumer of an element (a pressable control). */
  attachConsumer(element: Element, consumer: TouchConsumer): () => void {
    const registration = this.registrationFor(element);
    registration.consumer = consumer;
    this.syncListeners();
    return () => {
      if (registration.consumer === consumer) {
        registration.consumer = null;
      }
      // Even when the element keeps a recognizer: one left disabled keeps
      // no listener or observer (FR24).
      this.syncListeners();
      this.cleanup(element, registration);
    };
  }

  /**
   * Find consumers of a kind by attribute, one instance per contact. Returns
   * the function that stops it.
   */
  addDelegatedConsumer(type: DelegatedConsumerType): () => void {
    this.delegated.add(type);
    this.syncListeners();
    return () => {
      this.delegated.delete(type);
      this.syncListeners();
    };
  }

  /**
   * Re-derive an element's styles and the host's listeners after its
   * recognizers' options or its consumer's enabled state changed.
   */
  update(element: Element): void {
    const registration = this.registry.get(element);
    if (registration != null) {
      this.refresh(element, registration);
    }
    this.syncListeners();
  }

  /**
   * The Pointer Events `pointerId` of a contact the arena tracks: a mouse's
   * or a pen's own, and for a finger driven by touch events the pointer its
   * touch was paired with (null before the pairing, or without Pointer
   * Events). It hands a held finger to code that follows pointers, as a
   * menu does when a long press turns into a press-drag selection.
   */
  pointerIdOf(touch: GestureTouch | number): number | null {
    const id = typeof touch === 'number' ? touch : touch.id;
    for (const [pointerId, arenaId] of this.fingerPointers) {
      if (arenaId === id) {
        return pointerId;
      }
    }
    for (const [pointerId, arenaId] of this.pointerIds) {
      if (arenaId === id) {
        return pointerId;
      }
    }
    return null;
  }

  /**
   * Whether a finger set a scroller containing `node` moving within the last
   * `window` ms. A touch there now brakes the scroll rather than pressing
   * whatever is under it: a native list highlights nothing for one.
   */
  isScrollBraking(
    node: Node,
    window: number = UIKIT_GESTURES.press.scrollBrake.value,
  ): boolean {
    const last = this.lastScroll;
    return (
      last != null &&
      this.arena.now() - last.time < window &&
      last.scroller.contains(node)
    );
  }

  private registrationFor(element: Element): Registration {
    let registration = this.registry.get(element);
    if (registration == null) {
      registration = {
        recognizers: [],
        consumer: null,
        touchMoveListener: null,
        touchEndListener: null,
        savedStyle: new Map(),
        authorTouchAction: null,
        manageStyle: true,
        actionGroup: false,
      };
      this.registry.set(element, registration);
    }
    return registration;
  }

  private refresh(element: Element, registration: Registration): void {
    if (registration.manageStyle && element instanceof HTMLElement) {
      this.applyStyle(element, registration);
    }
    // For every pointer (FR43): a finger's claim cancels its moves here
    // (FR19), a listener FR24 counts apart from the one an element keeps for
    // its press.
    const needsListener = registration.recognizers.some(
      r => r.isEnabled && claimsWhileMoving(r),
    );
    if (needsListener && registration.touchMoveListener == null) {
      const listener: EventListener = event =>
        this.cancelIfClaimed(event as TouchEvent);
      registration.touchMoveListener = listener;
      element.addEventListener('touchmove', listener, {passive: false});
    } else if (!needsListener && registration.touchMoveListener != null) {
      element.removeEventListener('touchmove', registration.touchMoveListener);
      registration.touchMoveListener = null;
    }
    // Pointer Events only: a claimed finger's touchend is not the host's
    // own document listener's to cancel, so the element cancels it.
    const needsEndListener =
      this.inputMode === 'pointer-events' &&
      registration.recognizers.some(r => r.isEnabled && r.acceptsTouchInput);
    if (needsEndListener && registration.touchEndListener == null) {
      const listener: EventListener = event =>
        this.cancelClaimedLift(event as TouchEvent);
      registration.touchEndListener = listener;
      element.addEventListener('touchend', listener, {passive: false});
    } else if (!needsEndListener && registration.touchEndListener != null) {
      element.removeEventListener('touchend', registration.touchEndListener);
      registration.touchEndListener = null;
    }
  }

  private applyStyle(element: HTMLElement, registration: Registration): void {
    // Where no attached recognizer is enabled the host manages no style: the
    // element keeps its own touch-action, and any value set before is
    // restored (FR24). Every pointer gets it: a touchscreen laptop's finger
    // as a phone's (spec:AST-094 FR43).
    const enabled = registration.recognizers.filter(r => r.isEnabled);
    const style: GestureHostStyle =
      enabled.length > 0 ? gestureHostStyle(enabled) : {};
    for (const key of Object.keys(
      STYLE_PROPERTIES,
    ) as (keyof GestureHostStyle)[]) {
      const property = STYLE_PROPERTIES[key];
      let value = style[key];
      if (key === 'touchAction') {
        value = this.touchActionToWrite(element, registration, value);
      }
      if (value != null) {
        if (!registration.savedStyle.has(property)) {
          registration.savedStyle.set(
            property,
            element.style.getPropertyValue(property),
          );
        }
        element.style.setProperty(property, value);
      } else if (registration.savedStyle.has(property)) {
        const saved = registration.savedStyle.get(property) ?? '';
        registration.savedStyle.delete(property);
        if (saved === '') {
          element.style.removeProperty(property);
        } else {
          element.style.setProperty(property, saved);
        }
      }
    }
  }

  /**
   * The touch-action to write inline, if any. The author's value (a
   * trigger's own `touch-action: none`) stays in force and the host never
   * allows more (spec:AST-094 FR18, DEC-8):
   * - an inline value is the style's own, read with no recalc, and the host
   *   writes what both allow, inline; a CSS-wide keyword (`initial`,
   *   `inherit`, `unset`, `revert`, `revert-layer`) names no touch-action of
   *   its own, so it is read as an author rule is, as what it resolves to;
   * - otherwise the element is marked with the derived value, under a rule
   *   any author rule outranks, as the recognizer attaches: a subtree that
   *   mounts with it is styled once, never restyled for it in a later frame.
   *   The next frame reads what is in force, styles clean, and the host
   *   writes inline only what both allow where that is narrower than an
   *   author rule's value.
   */
  private touchActionToWrite(
    element: HTMLElement,
    registration: Registration,
    derived: string | undefined,
  ): string | undefined {
    if (derived == null) {
      unmarkTouchAction(element);
      registration.authorTouchAction = null;
      return undefined;
    }
    const property = STYLE_PROPERTIES.touchAction;
    const inline = registration.savedStyle.has(property)
      ? (registration.savedStyle.get(property) ?? '')
      : element.style.getPropertyValue(property);
    if (inline !== '' && !isCssWideKeyword(inline)) {
      unmarkTouchAction(element);
      return intersectTouchAction(derived, inline);
    }
    if (!markTouchAction(element, derived)) {
      // No document or shadow root to hold the rule (a detached element):
      // nothing is styled there, and the next frame looks again.
      this.readCallerTouchActionInNextFrame(element);
      return undefined;
    }
    const read = registration.authorTouchAction;
    if (read == null || read.derived !== derived) {
      // The rule is in force until the read: the derived value, or the
      // author's where the author sets one.
      this.readCallerTouchActionInNextFrame(element);
      return undefined;
    }
    if (read.author == null) {
      return undefined;
    }
    const both = intersectTouchAction(derived, read.author);
    return both === read.author ? undefined : both;
  }

  /**
   * Read the touch-action in force on each marked element in the next frame,
   * then apply its style again. Batched: one style read serves every pending
   * element, and the writes follow the reads. The host has written no
   * touch-action inline on them, so a value other than the mark is an author
   * rule's.
   */
  private readCallerTouchActionInNextFrame(element: HTMLElement): void {
    this.pendingCallerReads.add(element);
    if (this.isCallerReadScheduled) {
      return;
    }
    this.isCallerReadScheduled = true;
    inNextFrame(this.doc.defaultView, () => {
      this.isCallerReadScheduled = false;
      const pending: [HTMLElement, Registration][] = [];
      for (const candidate of this.pendingCallerReads) {
        const registration = this.registry.get(candidate);
        if (registration != null) {
          pending.push([candidate, registration]);
        }
      }
      this.pendingCallerReads.clear();
      const view = this.doc.defaultView;
      for (const [candidate, registration] of pending) {
        const derived = candidate.getAttribute(TOUCH_ACTION_ATTRIBUTE);
        if (derived == null || view == null) {
          continue;
        }
        const inForce = view.getComputedStyle(candidate).touchAction || 'auto';
        registration.authorTouchAction = {
          derived,
          author: inForce === derived ? null : inForce,
        };
      }
      for (const [candidate, registration] of pending) {
        this.applyStyle(candidate, registration);
      }
    });
  }

  private cleanup(element: Element, registration: Registration): void {
    if (registration.recognizers.length > 0 || registration.consumer != null) {
      return;
    }
    if (registration.touchMoveListener != null) {
      element.removeEventListener('touchmove', registration.touchMoveListener);
    }
    if (registration.touchEndListener != null) {
      element.removeEventListener('touchend', registration.touchEndListener);
      registration.touchEndListener = null;
    }
    this.registry.delete(element);
    this.syncListeners();
  }

  /**
   * Listen only while something could take a touch now (`spec:AST-094`
   * FR24, FR43): where the primary pointer is coarse, while an enabled
   * recognizer or consumer, or a delegated consumer, is attached; where it is
   * fine, only during a press something armed (syncArmed). Otherwise no page
   * listener is registered, so an idle page and a disabled control pay
   * nothing.
   */
  private syncListeners(): void {
    this.syncLayoutWatch();
    // The primary pointer can change (a tablet's keyboard attached or
    // removed): while anything is attached, styles and listeners follow it.
    // Nothing touch-related stays once the last attachment goes (FR24).
    const hasAttachments = this.registry.size > 0 || this.delegated.size > 0;
    if (hasAttachments && !this.isWatchingPointer) {
      this.coarseQuery?.addEventListener?.('change', this.onPointerKindChange);
      this.isWatchingPointer = true;
    } else if (!hasAttachments && this.isWatchingPointer) {
      this.coarseQuery?.removeEventListener?.(
        'change',
        this.onPointerKindChange,
      );
      this.isWatchingPointer = false;
    }
    this.syncArmed();
    if (this.shouldListen()) {
      this.install();
    } else if (this.isInstalled) {
      this.uninstall();
    }
  }

  private shouldListen(): boolean {
    if (!this.isPrimaryPointerCoarse()) {
      return this.isArmedPress;
    }
    if (this.delegated.size > 0) {
      return true;
    }
    for (const registration of this.registry.values()) {
      if (isServed(registration)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Where the primary pointer is fine, each element with an enabled
   * recognizer or press consumer listens for a press itself: one passive
   * `pointerdown` listener, in the capture phase, so the outermost one hears
   * a press first and serves every recognizer on its path. Delegated
   * consumer types, which have no element, arm the document once. A press
   * installs the host's page listeners for as long as its contacts last
   * (`spec:AST-094` FR24, FR43). Where the primary pointer is coarse the
   * page's listeners serve every press, and nothing is armed.
   */
  private syncArmed(): void {
    const wanted = new Set<EventTarget>();
    if (!this.isPrimaryPointerCoarse()) {
      for (const [element, registration] of this.registry) {
        if (isServed(registration)) {
          wanted.add(element);
        }
      }
      if (this.delegated.size > 0) {
        wanted.add(this.doc);
      }
    }
    for (const [target, disarm] of [...this.armed]) {
      if (!wanted.has(target)) {
        disarm();
        this.armed.delete(target);
      }
    }
    for (const target of wanted) {
      if (this.armed.has(target)) {
        continue;
      }
      target.addEventListener(
        'pointerdown',
        this.onArmedPress,
        PASSIVE_CAPTURE,
      );
      this.armed.set(target, () => {
        target.removeEventListener(
          'pointerdown',
          this.onArmedPress,
          PASSIVE_CAPTURE,
        );
      });
    }
  }

  /**
   * A press on something armed, where the primary pointer is fine: a
   * mouse's primary button, a pen, or a finger. The page's listeners come
   * for this press, and the press goes on to them, its capture phase on the
   * page being over.
   */
  private readonly onArmedPress = (event: Event): void => {
    const press = event as PointerEvent;
    if (
      this.isInstalled ||
      !isPointerKind(press.pointerType) ||
      (press.pointerType !== 'touch' && !isPrimaryClick(press))
    ) {
      return;
    }
    this.isArmedPress = true;
    this.install();
    this.onPointerDown(press);
    // A mouse's or a pen's press that nothing took has nothing to wait for;
    // a finger's contact begins at its touchstart, which comes next.
    if (press.pointerType !== 'touch') {
      this.releaseArmedPress();
    }
  };

  /**
   * After a contact ends: once no contact of the press that armed the page's
   * listeners is down, they go (FR24). A recognizer still deciding after the
   * lift needs no input; the click it may owe keeps its listener
   * (releaseClickListener).
   */
  private releaseArmedPress(): void {
    if (
      this.isArmedPress &&
      !this.arena.touches.some(
        touch => touch.phase !== 'ended' && touch.phase !== 'cancelled',
      )
    ) {
      this.isArmedPress = false;
      this.syncListeners();
    }
  }

  /**
   * The click listener outlives the page's others while the swallower is
   * armed: a claimed lift's click comes after its pointerup or touchend
   * (`spec:AST-094` FR21; FR24 counts it as press work). It goes when that
   * window closes, unless the host listens again by then.
   */
  private releaseClickListener(): void {
    const view = this.doc.defaultView;
    if (this.clickRemoval != null) {
      clearTimeout(this.clickRemoval);
      this.clickRemoval = null;
    }
    const remaining = this.swallowDeadline - browserClock.now();
    if (view == null || remaining < 0) {
      view?.removeEventListener('click', this.onClick, ACTIVE_CAPTURE);
      return;
    }
    this.clickRemoval = setTimeout(() => {
      this.clickRemoval = null;
      if (!this.isInstalled) {
        view.removeEventListener('click', this.onClick, ACTIVE_CAPTURE);
      }
    }, remaining + 1);
  }

  // --- Listeners -------------------------------------------------------------

  private install(): void {
    if (this.isInstalled) {
      return;
    }
    if (this.clickRemoval != null) {
      clearTimeout(this.clickRemoval);
      this.clickRemoval = null;
    }
    const view = this.doc.defaultView;
    this.isInstalled = true;
    this.usesTouchEvents =
      this.inputMode === 'auto' && view != null && 'ontouchstart' in view;
    const doc = this.doc;
    // Pointer Events only: a finger comes from its pointer events alone. A
    // browser that has Touch Events still sends them for the same finger, and
    // reading both would track it twice (a long press needs one touch).
    if (this.inputMode === 'auto') {
      doc.addEventListener('touchstart', this.onTouchStart, PASSIVE_CAPTURE);
      doc.addEventListener('touchmove', this.onTouchMove, PASSIVE_CAPTURE);
      doc.addEventListener('touchend', this.onTouchEnd, ACTIVE_CAPTURE);
      doc.addEventListener('touchcancel', this.onTouchCancel, PASSIVE_CAPTURE);
    }
    doc.addEventListener('pointerdown', this.onPointerDown, PASSIVE_CAPTURE);
    doc.addEventListener('pointermove', this.onPointerMove, PASSIVE_CAPTURE);
    doc.addEventListener('pointerup', this.onPointerUp, PASSIVE_CAPTURE);
    doc.addEventListener(
      'pointercancel',
      this.onPointerCancel,
      PASSIVE_CAPTURE,
    );
    doc.addEventListener('contextmenu', this.onContextMenu, ACTIVE_CAPTURE);
    doc.addEventListener('scroll', this.onScroll, PASSIVE_CAPTURE);
    doc.addEventListener('visibilitychange', this.onVisibilityChange);
    view?.addEventListener('click', this.onClick, ACTIVE_CAPTURE);
    view?.addEventListener('blur', this.onBlur);
  }

  private uninstall(): void {
    if (!this.isInstalled) {
      return;
    }
    this.isInstalled = false;
    const doc = this.doc;
    const view = doc.defaultView;
    doc.removeEventListener('touchstart', this.onTouchStart, PASSIVE_CAPTURE);
    doc.removeEventListener('touchmove', this.onTouchMove, PASSIVE_CAPTURE);
    doc.removeEventListener('touchend', this.onTouchEnd, ACTIVE_CAPTURE);
    doc.removeEventListener('touchcancel', this.onTouchCancel, PASSIVE_CAPTURE);
    doc.removeEventListener('pointerdown', this.onPointerDown, PASSIVE_CAPTURE);
    doc.removeEventListener('pointermove', this.onPointerMove, PASSIVE_CAPTURE);
    doc.removeEventListener('pointerup', this.onPointerUp, PASSIVE_CAPTURE);
    doc.removeEventListener(
      'pointercancel',
      this.onPointerCancel,
      PASSIVE_CAPTURE,
    );
    doc.removeEventListener('contextmenu', this.onContextMenu, ACTIVE_CAPTURE);
    doc.removeEventListener('scroll', this.onScroll, PASSIVE_CAPTURE);
    doc.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.releaseClickListener();
    view?.removeEventListener('blur', this.onBlur);
    this.cancelEverything(this.arena.now());
    this.lastTouch = null;
    this.lastScroll = null;
  }

  // --- Hit path --------------------------------------------------------------

  /**
   * The recognizers on the path from `target` to the document, innermost
   * first, and (for a contact) its consumer: the innermost element with an
   * attached consumer or a delegated consumer type's attribute.
   */
  private participantsAt(
    target: unknown,
    pointerType: PointerKind | null,
  ): {
    recognizers: GestureRecognizer[];
    consumer: TouchConsumer | null;
  } {
    const recognizers: GestureRecognizer[] = [];
    let consumer: TouchConsumer | null = null;
    let hasConsumerOwner = pointerType == null;
    for (
      let node: Node | null = target instanceof Node ? target : null;
      node != null;
      node = parentAcrossShadow(node)
    ) {
      if (!(node instanceof Element)) {
        continue;
      }
      const registration = this.registry.get(node);
      if (registration != null) {
        recognizers.push(...registration.recognizers);
      }
      if (hasConsumerOwner || pointerType == null) {
        continue;
      }
      if (registration?.consumer != null) {
        consumer = registration.consumer;
        hasConsumerOwner = true;
        continue;
      }
      for (const type of this.delegated) {
        if (node.hasAttribute(type.attribute)) {
          consumer = type.create(node, pointerType);
          hasConsumerOwner = true;
          break;
        }
      }
    }
    return {recognizers, consumer};
  }

  // --- Touch events ----------------------------------------------------------

  /** Whether this event is new to the host (and mark it handled). */
  private takeEvent(event: Event): boolean {
    if (this.processed.has(event)) {
      return false;
    }
    this.processed.add(event);
    return true;
  }

  private readonly onTouchStart = (event: TouchEvent): void => {
    if (!this.takeEvent(event)) {
      return;
    }
    const time = eventTime(event);
    const inputs: ArenaBeganInput[] = [];
    const untracked: TouchBeganInput[] = [];
    const stale: number[] = [];
    for (const touch of touchesOf(event.changedTouches)) {
      if ((touch as StylusTouch).touchType === 'stylus') {
        continue;
      }
      // A finger number still tracked here began again: the touch it named
      // ended where no listener of ours could hear it.
      const previous = this.forgetFinger(touch.identifier);
      if (previous != null) {
        stale.push(previous);
      }
      const target = touch.target instanceof Node ? touch.target : event.target;
      const {recognizers, consumer} = this.participantsAt(target, 'touch');
      if (recognizers.length === 0 && consumer == null) {
        // Nothing here takes part: the touch stays the page's, but a
        // recognizer tracking another finger hears it began (a second
        // finger beside an open menu ends its press, spec:AST-094 FR28).
        untracked.push({
          id: this.nextId++,
          x: touch.clientX,
          y: touch.clientY,
          time,
          pointerType: 'touch',
          target,
        });
        continue;
      }
      const id = this.nextId++;
      this.touchIds.set(touch.identifier, id);
      this.holdSelection(id, recognizers);
      this.watchTarget(
        touch.identifier,
        target,
        recognizers.some(claimsWhileMoving),
      );
      this.lastFed.set(id, {x: touch.clientX, y: touch.clientY, time});
      this.pairTouch(id, {x: touch.clientX, y: touch.clientY, target});
      inputs.push({
        id,
        x: touch.clientX,
        y: touch.clientY,
        time,
        pointerType: 'touch',
        target,
        scroll: createNativeScrollProbe(target),
        recognizers,
        consumer,
      });
    }
    if (stale.length > 0) {
      this.arena.cancelled(stale, time);
    }
    this.arena.began(inputs);
    for (const input of untracked) {
      this.arena.untrackedBegan(input);
    }
    // Stamped after the consumers judged the touch: the brake asks whether
    // an EARLIER finger is still driving a scroll.
    if (event.target instanceof Node) {
      this.lastTouch = {target: event.target, time};
    }
  };

  private readonly onTouchMove = (event: TouchEvent): void => {
    if (!this.takeEvent(event)) {
      return;
    }
    this.dropFingersNotDown(event);
    const time = eventTime(event);
    const ids: number[] = [];
    const inputs: TouchInput[] = [];
    for (const touch of touchesOf(event.changedTouches)) {
      const id = this.touchIds.get(touch.identifier);
      if (id == null) {
        continue;
      }
      ids.push(id);
      inputs.push({id, x: touch.clientX, y: touch.clientY, time});
    }
    if (inputs.length === 0) {
      return;
    }
    if (!event.cancelable) {
      // The browser no longer asks the page about these fingers. WebKit
      // stops asking when it takes the touch to pan (its pointercancel comes
      // with it); Chromium also stops after one unconsumed touchmove, even
      // when `touch-action` keeps it from panning the way the finger went (a
      // horizontal drag under pan-y). So a finger's FIRST uncancelable move
      // counts as the browser's claim only if the browser could pan along
      // the finger's main axis since touch-down; later ones add nothing, and
      // pointercancel or a scroll still report any real pan.
      const placed = new Map(inputs.map(input => [input.id, input]));
      const taken = ids.filter(id => {
        const touch = this.arena.getTouch(id);
        if (
          touch == null ||
          touch.takenByBrowser ||
          this.arena.isClaimed(id) ||
          touch.scroll?.allowsNativePan === false ||
          this.judgedUncancelable.has(id)
        ) {
          return false;
        }
        this.judgedUncancelable.add(id);
        const input = placed.get(id);
        if (input == null || touch.scroll == null) {
          return true;
        }
        const dx = input.x - touch.startX;
        const dy = input.y - touch.startY;
        return Math.abs(dx) >= Math.abs(dy)
          ? touch.scroll.canScroll(dx, 0)
          : touch.scroll.canScroll(0, dy);
      });
      if (taken.length > 0) {
        this.arena.browserTookOver(taken, time);
      }
    }
    this.feedMoves(inputs);
  };

  /**
   * Under `inputMode: 'pointer-events'` a finger comes from its pointer
   * events, so its touches carry no id of ours: the live finger it is, the
   * nearest pointer-fed finger on the same target. Its touchmoves can then
   * be cancelled once a recognizer claims it (`spec:AST-094` FR19, FR21).
   */
  private pointerFingerAt(touch: Touch): number | undefined {
    let best: GestureTouch | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const finger of this.arena.touches) {
      if (
        finger.pointerType !== 'touch' ||
        finger.phase === 'ended' ||
        finger.phase === 'cancelled' ||
        !(finger.target instanceof Node) ||
        !(touch.target instanceof Node) ||
        !(
          finger.target === touch.target ||
          finger.target.contains(touch.target) ||
          touch.target.contains(finger.target)
        )
      ) {
        continue;
      }
      const d = Math.hypot(finger.x - touch.clientX, finger.y - touch.clientY);
      if (d < bestDistance) {
        best = finger;
        bestDistance = d;
      }
    }
    return best?.id;
  }

  /**
   * Cancel the `touchend` of a finger a recognizer owned when it lifted
   * (`inputMode: 'pointer-events'`): its `pointerup` came first, at the same
   * place on the same target (`spec:AST-094` FR21).
   */
  private cancelClaimedLift(event: TouchEvent): void {
    if (!event.cancelable || event.defaultPrevented) {
      return;
    }
    for (const touch of touchesOf(event.changedTouches)) {
      const index = this.claimedLifts.findIndex(lift =>
        isSamePlace(lift, {
          x: touch.clientX,
          y: touch.clientY,
          target: touch.target,
        }),
      );
      if (index >= 0) {
        this.claimedLifts.splice(index, 1);
        event.preventDefault();
        return;
      }
    }
  }

  /**
   * Cancel a `touchmove` while a recognizer owns one of its fingers. A touch
   * no recognizer owns keeps its moves (`spec:AST-094` FR19): nothing is
   * cancelled before a recognizer begins, or for a touch it does not track.
   */
  private cancelIfClaimed(event: TouchEvent): void {
    if (!event.cancelable || event.defaultPrevented) {
      return;
    }
    // Only the touches this move reports: another finger a recognizer owns
    // does not make this one its own.
    const moved = touchesOf(event.changedTouches);
    for (const touch of moved) {
      const id =
        this.touchIds.get(touch.identifier) ??
        (this.inputMode === 'pointer-events'
          ? this.pointerFingerAt(touch)
          : undefined);
      if (id != null && this.arena.isClaimed(id)) {
        event.preventDefault();
        return;
      }
    }
    if (moved.some(touch => (touch as StylusTouch).touchType === 'stylus')) {
      for (const id of this.pointerIds.values()) {
        if (this.arena.isClaimed(id)) {
          // A pen whose pointer a recognizer owns: its stylus touches too,
          // never a finger no recognizer owns.
          event.preventDefault();
          return;
        }
      }
    }
  }

  private readonly onTouchEnd = (event: TouchEvent): void => {
    if (!this.takeEvent(event)) {
      return;
    }
    this.dropFingersNotDown(event);
    const time = eventTime(event);
    const inputs: TouchInput[] = [];
    for (const touch of touchesOf(event.changedTouches)) {
      const id = this.forgetFinger(touch.identifier);
      if (id == null) {
        continue;
      }
      inputs.push({id, x: touch.clientX, y: touch.clientY, time});
    }
    // The lift is when momentum starts: the clock the brake wants most.
    if (event.target instanceof Node) {
      this.lastTouch = {target: event.target, time};
    }
    if (inputs.length === 0) {
      this.releaseArmedPress();
      return;
    }
    const dispositions = this.arena.ended(inputs);
    if (needsSuppression(dispositions)) {
      if (event.cancelable) {
        event.preventDefault();
      }
      this.armSwallower();
    }
    this.releaseArmedPress();
  };

  private readonly onTouchCancel = (event: TouchEvent): void => {
    if (!this.takeEvent(event)) {
      return;
    }
    const listed = touchesOf(event.changedTouches);
    // A cancel that names no finger is the system taking them all.
    const identifiers =
      listed.length > 0
        ? listed.map(touch => touch.identifier)
        : [...this.touchIds.keys()];
    const ids: number[] = [];
    for (const identifier of identifiers) {
      const id = this.forgetFinger(identifier);
      if (id != null) {
        ids.push(id);
      }
    }
    if (ids.length > 0) {
      this.arena.cancelled(ids, eventTime(event));
    }
    this.releaseArmedPress();
  };

  /** The target's own listeners, for a target that left the document. */
  private readonly onTargetTouchMove = (event: Event): void => {
    this.onTouchMove(event as TouchEvent);
    this.cancelIfClaimed(event as TouchEvent);
  };

  /** The same for a finger nothing could claim while it moves: never blocks. */
  private readonly onTargetTouchMovePassive = (event: Event): void => {
    this.onTouchMove(event as TouchEvent);
  };

  private readonly onTargetTouchEnd = (event: Event): void => {
    this.onTouchEnd(event as TouchEvent);
  };

  private readonly onTargetTouchCancel = (event: Event): void => {
    this.onTouchCancel(event as TouchEvent);
  };

  /**
   * Cancel tracked fingers the event says are no longer down. `touches`
   * lists every finger on the screen; one missing from it (and not lifting
   * in this very event) ended where we could not see it.
   */
  private dropFingersNotDown(event: TouchEvent): void {
    if (event.touches == null || this.touchIds.size === 0) {
      return;
    }
    const down = new Set<number>();
    for (const touch of touchesOf(event.touches)) {
      down.add(touch.identifier);
    }
    for (const touch of touchesOf(event.changedTouches)) {
      down.add(touch.identifier);
    }
    const gone = [...this.touchIds.keys()].filter(
      identifier => !down.has(identifier),
    );
    const ids: number[] = [];
    for (const identifier of gone) {
      const id = this.forgetFinger(identifier);
      if (id != null) {
        ids.push(id);
      }
    }
    if (ids.length > 0) {
      this.arena.cancelled(ids, eventTime(event));
    }
  }

  private watchTarget(
    identifier: number,
    target: EventTarget | null,
    isBlocking: boolean,
  ): void {
    if (target == null || typeof target.addEventListener !== 'function') {
      return;
    }
    this.touchTargets.set(identifier, target);
    const state = this.watched.get(target);
    if (state == null) {
      this.watched.set(target, {count: 1, blocking: isBlocking ? 1 : 0});
      if (isBlocking) {
        this.blockingFingers.add(identifier);
      }
      target.addEventListener(
        'touchmove',
        isBlocking ? this.onTargetTouchMove : this.onTargetTouchMovePassive,
        {passive: !isBlocking},
      );
      target.addEventListener('touchend', this.onTargetTouchEnd, {
        passive: false,
      });
      target.addEventListener('touchcancel', this.onTargetTouchCancel, {
        passive: true,
      });
      return;
    }
    const wasBlocking = state.blocking > 0;
    state.count += 1;
    if (isBlocking) {
      state.blocking += 1;
      this.blockingFingers.add(identifier);
    }
    this.swapTargetTouchMove(target, wasBlocking, state.blocking > 0);
  }

  private unwatchTarget(identifier: number): void {
    const target = this.touchTargets.get(identifier);
    if (target == null) {
      return;
    }
    this.touchTargets.delete(identifier);
    const state = this.watched.get(target);
    if (state == null) {
      return;
    }
    const wasBlocking = state.blocking > 0;
    state.count -= 1;
    if (this.blockingFingers.delete(identifier)) {
      state.blocking -= 1;
    }
    if (state.count > 0) {
      this.swapTargetTouchMove(target, wasBlocking, state.blocking > 0);
      return;
    }
    this.watched.delete(target);
    target.removeEventListener(
      'touchmove',
      wasBlocking ? this.onTargetTouchMove : this.onTargetTouchMovePassive,
    );
    target.removeEventListener('touchend', this.onTargetTouchEnd);
    target.removeEventListener('touchcancel', this.onTargetTouchCancel);
  }

  /**
   * Keeps one `touchmove` listener on a watched target: the blocking one
   * while a finger on it could be claimed as it moves, a passive one
   * otherwise, so a scroll starting there never waits on the main thread
   * (`spec:AST-094` FR19).
   */
  private swapTargetTouchMove(
    target: EventTarget,
    wasBlocking: boolean,
    isBlocking: boolean,
  ): void {
    if (wasBlocking === isBlocking) {
      return;
    }
    target.removeEventListener(
      'touchmove',
      wasBlocking ? this.onTargetTouchMove : this.onTargetTouchMovePassive,
    );
    target.addEventListener(
      'touchmove',
      isBlocking ? this.onTargetTouchMove : this.onTargetTouchMovePassive,
      {passive: !isBlocking},
    );
  }

  /** Stop tracking a finger by its Touch.identifier; returns its arena id. */
  private forgetFinger(identifier: number): number | undefined {
    const id = this.touchIds.get(identifier);
    this.touchIds.delete(identifier);
    this.unwatchTarget(identifier);
    if (id != null) {
      this.forgetContact(id);
    }
    return id;
  }

  private pairTouch(id: number, place: PlacedContact): void {
    for (const [pointerId, pending] of this.pendingPointers) {
      if (isSamePlace(pending, place)) {
        this.pendingPointers.delete(pointerId);
        this.fingerPointers.set(pointerId, id);
        return;
      }
    }
    this.unpairedTouches.set(id, place);
  }

  private pairPointer(pointerId: number, place: PlacedContact): void {
    for (const [id, unpaired] of this.unpairedTouches) {
      if (isSamePlace(unpaired, place)) {
        this.unpairedTouches.delete(id);
        this.fingerPointers.set(pointerId, id);
        return;
      }
    }
    this.pendingPointers.set(pointerId, place);
  }

  /** Feed moves, dropping the echo of a move the other channel delivered. */
  private feedMoves(inputs: ReadonlyArray<TouchInput>): void {
    const fresh = inputs.filter(input => {
      const last = this.lastFed.get(input.id);
      if (
        last != null &&
        (input.time < last.time ||
          (input.time === last.time &&
            input.x === last.x &&
            input.y === last.y))
      ) {
        return false;
      }
      this.lastFed.set(input.id, {x: input.x, y: input.y, time: input.time});
      return true;
    });
    if (fresh.length > 0) {
      this.arena.moved(fresh);
    }
  }

  /**
   * For one held press by a finger or a pen: text selection and the touch
   * callout off on the elements whose hold does something (a long press),
   * as `holdSelectionStyle` decides (`spec:AST-094` FR41, DEC-9).
   * Everything else keeps the browser's long-press selection. Restored when
   * the contact ends; refcounted across contacts on one element.
   */
  private holdSelection(
    id: number,
    recognizers: ReadonlyArray<GestureRecognizer>,
  ): void {
    const elements = new Set<HTMLElement>();
    for (const recognizer of recognizers) {
      if (
        recognizer.view instanceof HTMLElement &&
        recognizer.isEnabled &&
        // An element attached with manageStyle: false keeps its own styles.
        this.registry.get(recognizer.view)?.manageStyle !== false &&
        holdSelectionStyle([recognizer]) != null
      ) {
        elements.add(recognizer.view);
      }
    }
    if (elements.size === 0) {
      return;
    }
    const held = [...elements];
    for (const element of held) {
      const entry = heldSelection.get(element);
      if (entry != null) {
        entry.count += 1;
        continue;
      }
      const saved = HOLD_SELECTION_PROPERTIES.map(name => ({
        name,
        value: element.style.getPropertyValue(name),
        priority: element.style.getPropertyPriority(name),
      }));
      for (const name of HOLD_SELECTION_PROPERTIES) {
        element.style.setProperty(name, 'none');
      }
      heldSelection.set(element, {count: 1, saved});
    }
    this.heldSelectionBy.set(id, held);
  }

  /** Undo `holdSelection` for a contact that ended; idempotent. */
  private releaseSelection(id: number): void {
    const held = this.heldSelectionBy.get(id);
    if (held == null) {
      return;
    }
    this.heldSelectionBy.delete(id);
    for (const element of held) {
      const entry = heldSelection.get(element);
      if (entry == null) {
        continue;
      }
      entry.count -= 1;
      if (entry.count > 0) {
        continue;
      }
      heldSelection.delete(element);
      for (const {name, value, priority} of entry.saved) {
        if (value === '') {
          element.style.removeProperty(name);
        } else {
          element.style.setProperty(name, value, priority);
        }
      }
    }
  }

  /** Forget a contact's pairing and echo state. */
  private forgetContact(id: number): void {
    this.releaseSelection(id);
    this.lastFed.delete(id);
    this.judgedUncancelable.delete(id);
    this.unpairedTouches.delete(id);
    for (const [pointerId, paired] of this.fingerPointers) {
      if (paired === id) {
        this.fingerPointers.delete(pointerId);
      }
    }
  }

  // --- Pointer events --------------------------------------------------------

  private readonly onPointerDown = (event: PointerEvent): void => {
    // A new press: whatever click is still owed to the last one is not this.
    this.disarmSwallower();
    if (!isPointerKind(event.pointerType)) {
      return;
    }
    if (event.pointerType === 'touch' && this.usesTouchEvents) {
      this.pairPointer(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
        target: event.target,
      });
      return;
    }
    // A right click, a pen's barrel button and a ctrl-click on macOS start
    // no press (FR43).
    if (event.pointerType !== 'touch' && !isPrimaryClick(event)) {
      return;
    }
    const {recognizers, consumer} = this.participantsAt(
      event.target,
      event.pointerType,
    );
    if (recognizers.length === 0 && consumer == null) {
      return;
    }
    const id = this.nextId++;
    this.pointerIds.set(event.pointerId, id);
    if (event.pointerType !== 'mouse') {
      this.holdSelection(id, recognizers);
    }
    this.arena.began([
      {
        id,
        x: event.clientX,
        y: event.clientY,
        time: eventTime(event),
        pointerType: event.pointerType,
        target: event.target,
        scroll: createNativeScrollProbe(event.target),
        recognizers,
        consumer,
      },
    ]);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === 'touch' && this.usesTouchEvents) {
      const id = this.fingerPointers.get(event.pointerId);
      if (id != null) {
        this.feedMoves([
          {
            id,
            x: event.clientX,
            y: event.clientY,
            time: eventTime(event),
            history: coalescedHistory(event),
          },
        ]);
      }
      return;
    }
    const id = this.pointerIds.get(event.pointerId);
    if (id != null) {
      this.arena.moved([
        {
          id,
          x: event.clientX,
          y: event.clientY,
          time: eventTime(event),
          history: coalescedHistory(event),
        },
      ]);
      return;
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerType === 'touch' && this.usesTouchEvents) {
      // The lift itself is the touchend's: it alone can cancel the click.
      this.fingerPointers.delete(event.pointerId);
      this.pendingPointers.delete(event.pointerId);
      return;
    }
    const id = this.pointerIds.get(event.pointerId);
    if (id == null) {
      this.releaseArmedPress();
      return;
    }
    this.pointerIds.delete(event.pointerId);
    this.releaseSelection(id);
    if (event.pointerType === 'touch' && this.arena.isClaimed(id)) {
      this.claimedLifts.push({
        x: event.clientX,
        y: event.clientY,
        target: event.target,
      });
      if (this.claimedLifts.length > 8) {
        this.claimedLifts.shift();
      }
    }
    const dispositions = this.arena.ended([
      {id, x: event.clientX, y: event.clientY, time: eventTime(event)},
    ]);
    if (needsSuppression(dispositions)) {
      this.armSwallower();
    }
    this.releaseArmedPress();
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerType === 'touch' && this.usesTouchEvents) {
      const id =
        this.fingerPointers.get(event.pointerId) ??
        this.touchForCancelledPointer(event);
      this.fingerPointers.delete(event.pointerId);
      this.pendingPointers.delete(event.pointerId);
      if (id != null) {
        this.arena.browserTookOver([id], eventTime(event));
      }
      return;
    }
    const id = this.pointerIds.get(event.pointerId);
    if (id != null) {
      this.pointerIds.delete(event.pointerId);
      this.releaseSelection(id);
      this.arena.cancelled([id], eventTime(event));
    }
    this.releaseArmedPress();
  };

  /**
   * Which live finger a touch `pointercancel` is about. The pointer keeps
   * the target the finger landed on (implicit capture), as the Touch does;
   * among fingers on that target, the nearest. WebKit also numbers the
   * pointer like the Touch, which settles what position cannot.
   */
  private touchForCancelledPointer(event: PointerEvent): number | null {
    let best: GestureTouch | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const touch of this.arena.touches) {
      if (
        touch.pointerType !== 'touch' ||
        touch.phase === 'ended' ||
        touch.phase === 'cancelled' ||
        touch.target !== event.target
      ) {
        continue;
      }
      const d = Math.hypot(touch.x - event.clientX, touch.y - event.clientY);
      if (d < bestDistance) {
        best = touch;
        bestDistance = d;
      }
    }
    if (best != null) {
      return best.id;
    }
    return this.touchIds.get(event.pointerId) ?? null;
  }

  // --- Clicks, menus, scrolls, focus -----------------------------------------

  private armSwallower(): void {
    this.swallowDeadline =
      browserClock.now() + UIKIT_GESTURES.click.strayClickWindow.value;
  }

  private disarmSwallower(): void {
    this.swallowDeadline = Number.NEGATIVE_INFINITY;
  }

  private readonly onClick = (event: MouseEvent): void => {
    if (browserClock.now() > this.swallowDeadline) {
      return;
    }
    if (!event.isTrusted || event.detail === 0) {
      return;
    }
    if (
      event.target instanceof Element &&
      event.target.hasAttribute(HAPTIC_SWITCH_ATTRIBUTE)
    ) {
      return;
    }
    this.disarmSwallower();
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private replayClick(touch: GestureTouch, allowed: boolean): void {
    if (!allowed) {
      return;
    }
    // The browser's own click was swallowed while recognizers decided; they
    // all failed, so the click the touch earned is delivered now.
    this.disarmSwallower();
    const target = touch.target;
    const view = this.doc.defaultView;
    if (!(target instanceof Element) || !target.isConnected || view == null) {
      return;
    }
    target.dispatchEvent(
      new view.MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        composed: true,
        detail: 1,
        clientX: touch.x,
        clientY: touch.y,
      }),
    );
  }

  private readonly onContextMenu = (event: MouseEvent): void => {
    for (const touch of this.arena.touches) {
      if (this.arena.isClaimed(touch.id)) {
        event.preventDefault();
        return;
      }
    }
  };

  /**
   * A recognizer is about to scroll `scroller` itself (a menu's edge
   * autoscroll, spec:AST-094 FR30): the scroll that write fires is not a
   * finger's and not the browser taking one. It passes until the end of the
   * next frame, when that event has fired; a real pan in that window still
   * reports itself through pointercancel or touchcancel.
   */
  ownScroll(scroller: Node): void {
    this.ownedScrolls.add(scroller);
    const view = this.doc.defaultView;
    if (view == null) {
      return;
    }
    view.requestAnimationFrame(() => {
      view.requestAnimationFrame(() => {
        this.ownedScrolls.delete(scroller);
      });
    });
  }

  private readonly onScroll = (event: Event): void => {
    const time = eventTime(event);
    const scroller = event.target === this.doc ? this.doc : event.target;
    if (!(scroller instanceof Node) || this.ownedScrolls.has(scroller)) {
      return;
    }
    // A scroll is a finger's only if that finger was inside this scroller,
    // recently; anything else is the program moving something.
    const last = this.lastTouch;
    if (
      last != null &&
      time - last.time < UIKIT_GESTURES.press.momentumMemory.value &&
      scroller.contains(last.target)
    ) {
      this.lastScroll = {scroller, time};
    }
    const taken: number[] = [];
    for (const touch of this.arena.touches) {
      if (
        touch.takenByBrowser ||
        touch.phase === 'ended' ||
        touch.phase === 'cancelled' ||
        touch.pointerType !== 'touch' ||
        this.arena.isClaimed(touch.id)
      ) {
        continue;
      }
      if (
        touch.target instanceof Node &&
        scroller.contains(touch.target) &&
        // Only a pan this finger drove takes the touch: the browser starts
        // one only once the finger has travelled the take distance
        // (spec:AST-094 FR20). A scroll under a finger that has not
        // (scrollIntoView, a transcript pinned to its end, scroll
        // anchoring) is the page's own: the touch, and the click it earns,
        // stay where they are.
        Math.hypot(touch.x - touch.startX, touch.y - touch.startY) >=
          UIKIT_GESTURES.press.slop.value
      ) {
        taken.push(touch.id);
      }
    }
    if (taken.length > 0) {
      this.arena.browserTookOver(taken, time);
    }
  };

  private readonly onVisibilityChange = (): void => {
    if (this.doc.visibilityState === 'hidden') {
      this.cancelEverything(this.arena.now());
      this.releaseArmedPress();
    }
  };

  private readonly onBlur = (): void => {
    this.cancelEverything(this.arena.now());
    this.releaseArmedPress();
  };

  /** The app lost focus: UIKit cancels every touch in flight. */
  private cancelEverything(time: number): void {
    const ids = [...this.pointerIds.values()];
    for (const id of ids) {
      this.releaseSelection(id);
    }
    for (const identifier of [...this.touchIds.keys()]) {
      const id = this.forgetFinger(identifier);
      if (id != null) {
        ids.push(id);
      }
    }
    this.pointerIds.clear();
    this.fingerPointers.clear();
    this.pendingPointers.clear();
    this.unpairedTouches.clear();
    this.lastFed.clear();
    if (ids.length > 0) {
      this.arena.cancelled(ids, time);
    }
  }
}

/** Whether an attachment could take a press now: something on it is enabled. */
function isServed(registration: Registration): boolean {
  return (
    registration.recognizers.some(r => r.isEnabled) ||
    (registration.consumer != null &&
      registration.consumer.isEnabled?.() !== false)
  );
}

function needsSuppression(
  dispositions: Map<number, ClickDisposition>,
): boolean {
  for (const disposition of dispositions.values()) {
    if (disposition !== 'allow') {
      return true;
    }
  }
  return false;
}

function coalescedHistory(event: PointerEvent): TouchSample[] {
  if (typeof event.getCoalescedEvents !== 'function') {
    return [];
  }
  const coalesced = event.getCoalescedEvents();
  return coalesced.slice(0, -1).map(sample => ({
    x: sample.clientX,
    y: sample.clientY,
    time: eventTime(sample),
  }));
}

const hosts = new WeakMap<Document, GestureHost>();

/** The gesture host of a document, created on first use. */
export function getGestureHost(doc: Document): GestureHost {
  let host = hosts.get(doc);
  if (host == null) {
    host = new GestureHost(doc);
    hosts.set(doc, host);
  }
  return host;
}
