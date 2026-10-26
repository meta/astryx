// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file GestureHost.ts
 * @input DOM touch, pointer, click, contextmenu, scroll and focus events of
 *   one document; elements with recognizers and consumers attached
 * @output Exports GestureHost (the DOM side of the gesture system) and
 *   getGestureHost (one host per document)
 * @position Browser adapter of packages/core/src/gestures: turns real events
 *   into GestureArena input, and carries out what the arena decides
 *
 * ONLY WHERE THE PRIMARY POINTER IS COARSE
 *
 * - Recognizers attach, and the host registers listeners, only while the
 *   primary pointer is coarse (`spec:AST-094` FR19, FR24; coarsePointer.ts).
 *   Where it is fine, an attach is recorded but nothing is installed: no
 *   document, window or element listener, no `touch-action` or other style,
 *   nothing delivered, so a finger on a touchscreen laptop gets the
 *   browser's defaults. The host follows the query: turning coarse installs
 *   it and styles every registration; turning fine cancels every touch in
 *   flight and removes it all. A development warning names the first attach
 *   under a fine pointer.
 *
 * INPUT CHANNELS
 *
 * - Fingers begin and end with Touch Events: they are the only cancelable
 *   channel (a pointer event's preventDefault cannot stop a scroll or a
 *   click), they keep arriving after the browser takes a pan (which a scroll
 *   handoff needs), and every event lists all the fingers at once. A
 *   finger's movement is sampled from ONE channel: its `pointermove`s, once
 *   its pointerdown has paired with its touchstart (by target and
 *   position), since Chromium sends no `touchmove` until a finger has
 *   travelled about 16 px while a tap fails and a pan begins at 10; touch
 *   events sample only a finger no pointer event reported. The other
 *   channel keeps its control duties but feeds no sample.
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
 * FINGERS
 *
 * - The host keeps one record of where each finger on the screen landed
 *   (`fingersDown()`). Finger scrolls (fingerScroll.ts) read it, and a
 *   scroll lock's page hold (pageHold.ts) asks which touches a recognizer
 *   owns; both live in their own modules, so a page that needs neither
 *   never ships them.
 *
 * TOUCHES ON MOVING ELEMENTS
 *
 * - iOS WebKit hit-tests an element a compositor animation moves where the
 *   animation started. There, at touch-down, the host resolves the moving
 *   elements (motion/presentation.ts: one style write each) and asks the
 *   engine again, so a contact goes to what is drawn under it; press
 *   trackers read `presentedRect`, and a retargeted tap clicks what it
 *   touched once, with the engine's own click cancelled or swallowed.
 *
 * WHAT THE BROWSER IS TOLD
 *
 * - Each element gets the `touch-action` its recognizers leave the browser
 *   (touchAction.ts), never wider than the element's own value (a caller's
 *   explicit `touch-action` stays in force), set inline when they attach and
 *   restored when they detach.
 * - While a finger or a pen is down, text selection and the touch callout
 *   are off only where the hold does something (`spec:AST-094` FR41): on the
 *   elements of recognizers that bring a `selectionLock`, and on a non-text
 *   input under the finger inside them (WebKit's own style makes every
 *   input selectable); restored when the contact ends. Only where the
 *   primary pointer is coarse: a mouse never takes this lock, nor a finger
 *   or a pen where the primary pointer is fine.
 * - Each element with a recognizer that can claim a touch while it moves (a
 *   pan, a swipe, a long press that then drags, a pinch, a rotation) gets a
 *   NON-passive `touchmove` listener that cancels the event only while a
 *   recognizer owns one of its touches (a pan claims when it begins, at
 *   UIKit's 10 pt, `spec:AST-094` FR17). Nothing else is ever cancelled, so a
 *   touch nobody claims scrolls exactly as it would without the system. The
 *   known cost: a scroll that BEGINS on such an element waits for a busy main
 *   thread (measured in iOS Safari; a passive listener would hand every
 *   diagonal to the scroll instead). Elements whose recognizers only claim
 *   at the lift (taps), recognizers that never claim (`claimsTouches` false)
 *   and press consumers get no blocking listener, and the listener a
 *   finger's target gets at touch-down is passive for them too, so a scroll
 *   starting on them never waits.
 * - The browser took a finger on `pointercancel`, on its first uncancelable
 *   `touchmove` where it could pan, or on a scroll above it once the finger
 *   has travelled the slop; a scroll under a finger that has not moved is
 *   the page's own and leaves the touch alone.
 * - A lift whose click must not happen cancels its `touchend` (no click, no
 *   compatibility mouse events) and arms a one-shot swallower for the next
 *   trusted click; a click held for a recognizer that may still recognize is
 *   replayed if they all fail. Keyboard and assistive-technology clicks
 *   (`detail === 0`) always pass.
 * - A `contextmenu` while a recognizer owns a touch is cancelled, so a long
 *   press never also opens the browser's menu.
 *
 * SSR-safe: nothing touches `window` or `document` until something attaches.
 *
 * SYNC: When modified, update GestureHost.test.ts and README.md.
 */

import {isRtlElement} from '../hooks/isRtlElement';
import {
  presentedElements,
  presentedOffsetOf,
  resolvePresented,
  watchPresentedElements,
} from '../motion/presentation';
import {UIKIT_CLICK, UIKIT_PRESS, UIKIT_TAP} from '../motion/uikit/gestures';
import {
  browserClock,
  GestureArena,
  type ArenaBeganInput,
  type ClickDisposition,
  type GestureArenaOptions,
  type GestureClock,
} from './GestureArena';
import type {GestureRecognizer, SelectionLock} from './GestureRecognizer';
import type {PressBounds} from './PressTracker';
import {HAPTIC_SWITCH_ATTRIBUTE} from './hapticSwitch';
import type {HoverGestureRecognizer} from './HoverGestureRecognizer';
import type {PanGestureRecognizer} from './PanGestureRecognizer';
import {createNativeScrollProbe, parentAcrossShadow} from './nativeScroll';
import {
  gestureHostStyle,
  intersectTouchAction,
  type GestureHostStyle,
} from './touchAction';
import type {
  GestureEnvironment,
  GestureTouch,
  PointerKind,
  TouchBeganInput,
  TouchConsumer,
  TouchInput,
  TouchSample,
} from './types';
import {internals} from './recognizerInternals';
import {subscribeInput} from '../utils/inputStream';
import {locksSelectionFor} from '../utils/selectionLock';
import {isCoarsePointer, watchCoarsePointer} from '../utils/coarsePointer';
import {gestureHosts} from './hostRegistry';
import {
  markTouchAction,
  TOUCH_ACTION_ATTRIBUTE,
  unmarkTouchAction,
} from './touchActionRule';

interface Registration {
  readonly recognizers: GestureRecognizer[];
  readonly hovers: HoverGestureRecognizer[];
  consumer: TouchConsumer | null;
  /** Whether the element carries the host's shared blocking touchmove handler. */
  hasTouchMoveListener: boolean;
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
   * Send a contact to what is drawn while a compositor animation moves an
   * element (motion/presentation.ts): `auto` where the engine hit-tests such
   * an element where its animation started (iOS WebKit); `always` or
   * `never` for tests. @default 'auto'
   */
  presentedHitTesting?: 'auto' | 'always' | 'never';
  /**
   * Whether the primary pointer is coarse (a phone, a tablet). Where it is
   * fine, the host registers no listener at all (`spec:AST-094` FR19, FR24).
   * @default `(pointer: coarse)` on the document's window
   */
  isPrimaryPointerCoarse?: () => boolean;
}

export interface AttachOptions {
  /** Let the host set touch-action (and long-press callout) styles. @default true */
  manageStyle?: boolean;
  /**
   * The recognizer, or the press tracker, reads each event's pointer itself,
   * so it attaches even where the primary pointer is fine: the host installs
   * what it needs there, styles its element and raises no warning. A
   * recognizer does so as `spec:AST-057`'s row swipe does. A press tracker
   * there paints a finger's press feedback only (an FR19 exception for press
   * feedback only, pending in `spec:AST-094`'s amendment): no control event,
   * nothing kept from the browser, which still pans, and no mouse or pen
   * press. Everything else stays inactive there. @default false
   */
  perEventPointer?: boolean;
}

const STYLE_PROPERTIES: Record<keyof GestureHostStyle, string> = {
  touchAction: 'touch-action',
  WebkitTouchCallout: '-webkit-touch-callout',
  WebkitUserSelect: '-webkit-user-select',
  userSelect: 'user-select',
};

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

/**
 * Whether a recognizer can take a touch while it moves, and so needs the
 * blocking `touchmove` listener that stops the browser's pan. A tap claims
 * only at the lift (it fails once the finger travels), so it needs none.
 */
function claimsWhileMoving(recognizer: GestureRecognizer): boolean {
  return (
    recognizer.claimsTouches &&
    internals(recognizer).acceptsTouchInput &&
    internals(recognizer).family !== 'tap'
  );
}

/**
 * A hover recognizer, told apart by its family rather than its class, so a
 * page without one never ships HoverGestureRecognizer.
 */
function isHoverRecognizer(
  recognizer: GestureRecognizer,
): recognizer is HoverGestureRecognizer {
  return internals(recognizer).family === 'hover';
}

/**
 * A pan (or a pan subclass), told apart by its family rather than its class,
 * so a page that constructs no pan never ships PanGestureRecognizer.
 */
function isPanRecognizer(
  recognizer: GestureRecognizer,
): recognizer is PanGestureRecognizer {
  return internals(recognizer).family === 'pan';
}

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
  /** Stops following the animator's moving elements (iOS WebKit only). */
  private stopWatchingMovers: (() => void) | null = null;
  /** Whether the document carries the blocking touchmove for a mover. */
  private isBlockingForMovers = false;
  /** Elements whose caller touch-action waits for a read after paint. */
  private readonly pendingCallerReads = new Set<HTMLElement>();
  private isCallerReadScheduled = false;
  /** The selection lock each contact holds, by host contact id. */
  private readonly lockedBy = new Map<number, () => void>();
  private readonly presentedHitTesting: 'auto' | 'always' | 'never';
  /**
   * Contacts sent to what is drawn instead of what the engine hit, by host
   * contact id, with where they landed (for their click).
   */
  private readonly retargeted = new Map<
    number,
    {x: number; y: number; target: EventTarget}
  >();
  /** Touch.identifier → arena id, for live fingers. */
  private readonly touchIds = new Map<number, number>();
  /** Touch.identifier → the element the finger landed on. */
  private readonly touchTargets = new Map<number, EventTarget>();
  /** Finger targets with listeners of their own, and how many fingers each. */
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
  /** Fingers whose first uncancelable `touchmove` was already judged. */
  private readonly judgedUncancelable = new Set<number>();
  /**
   * A finger's pointerId → its arena id, once its pointerdown and its
   * touchstart are paired. Chromium sends no `touchmove` until a finger has
   * travelled its slop (about 16 px), but sends every `pointermove`, so a
   * paired finger is sampled from its pointer events (`pointerFed`); and its
   * `pointercancel` is the browser's claim of exactly that finger.
   */
  private readonly fingerPointers = new Map<number, number>();
  /** Finger pointerdowns still waiting for their touchstart. */
  private readonly pendingPointers = new Map<number, PlacedContact>();
  /** Fingers still waiting for their pointerdown, by arena id. */
  private readonly unpairedTouches = new Map<number, PlacedContact>();
  /** The last sample fed per contact: a contact's time never runs back. */
  private readonly isPrimaryPointerCoarse: () => boolean;
  /** Whether the host follows `(pointer: coarse)` (no read was passed). */
  private readonly followsPointer: boolean;
  private readonly lastFed = new Map<number, TouchSample>();
  /**
   * Fingers whose samples come from their pointer events. A finger the
   * browser reports on both channels is sampled from ONE: the pointer
   * channel, where its pointerdown paired with its touchstart; touch events
   * sample only a finger no pointer event reported (no Pointer Events). The
   * other channel keeps its control duties (cancelling, claiming, the
   * browser's takeover) but never feeds a sample, so the two copies of one
   * move cannot both reach a velocity, however far apart they arrive.
   */
  private readonly pointerFed = new Set<number>();
  private readonly hovered = new Map<number, Set<HoverGestureRecognizer>>();
  /** When a finger was last down or lifted, and where it landed. */
  private lastTouch: {readonly target: Node; readonly time: number} | null =
    null;
  /** The last scroll a finger drove, and when. */
  /** Scrollers a recognizer is scrolling itself this frame (ownScroll). */
  private readonly ownedScrolls = new Set<Node>();
  private lastScroll: {readonly scroller: Node; readonly time: number} | null =
    null;
  /** Predicates that hold a touch's target away from every participant. */
  private readonly touchGates = new Set<(target: Node) => boolean>();
  /** Who keeps the listeners installed without a registration (retain). */
  private retainers = 0;
  /** Told after every touch event that changed the fingers on the screen. */
  private readonly fingerListeners = new Set<() => void>();
  /**
   * Where each finger now on the screen landed, from the last touch event's
   * `touches` (every finger, whether or not a recognizer tracks it).
   */
  private fingerTargets: ReadonlyArray<Node> = [];
  private nextId = 1;
  private isInstalled = false;
  /**
   * Whether the primary pointer is coarse (`spec:AST-094` FR19), read when
   * something first attaches and kept current while anything is attached.
   */
  private isCoarse = false;
  private stopWatchingPointer: (() => void) | null = null;
  private hasWarnedFinePointer = false;
  /** Recognizers attached with `perEventPointer`: active on any pointer. */
  private readonly perEventRecognizers = new Set<GestureRecognizer>();
  /** The input stream subscriptions while installed. */
  private unsubscribers: (() => void)[] = [];
  /** Press consumers attached with `perEventPointer`: active on any pointer. */
  private readonly perEventConsumers = new Set<TouchConsumer>();
  private readonly inputMode: 'auto' | 'pointer-events';
  private usesTouchEvents = true;
  private swallowDeadline = Number.NEGATIVE_INFINITY;

  constructor(doc: Document, options: GestureHostOptions = {}) {
    this.doc = doc;
    this.inputMode = options.inputMode ?? 'auto';
    this.presentedHitTesting = options.presentedHitTesting ?? 'auto';
    const environment: GestureEnvironment = {
      viewportSize: () => ({
        width: doc.defaultView?.innerWidth ?? 0,
        height: doc.defaultView?.innerHeight ?? 0,
      }),
      // The writing direction through core's one helper.
      isRtl: view =>
        view instanceof Element && isRtlElement(view as HTMLElement),
    };
    this.arena = new GestureArena({
      clock: options.clock ?? browserClock,
      environment,
      onDeferredClick: (touch, allowed) => this.replayClick(touch, allowed),
      onTransition: options.onTransition,
    });
    const view = doc.defaultView;
    // A test may pass its own read; otherwise the one coarse-pointer gate,
    // followed as it changes.
    this.followsPointer = options.isPrimaryPointerCoarse == null;
    this.isPrimaryPointerCoarse =
      options.isPrimaryPointerCoarse ?? (() => isCoarsePointer(view));
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
    recognizer.view = element;
    if (options.perEventPointer === true) {
      this.perEventRecognizers.add(recognizer);
    } else if (!this.isCoarse) {
      this.warnFinePointer();
    }
    if (isHoverRecognizer(recognizer)) {
      registration.hovers.push(recognizer);
    } else {
      registration.recognizers.push(recognizer);
    }
    recognizer.onEnabledChange = () => {
      this.refresh(element, registration);
      this.syncListeners();
    };
    this.refresh(element, registration);
    this.syncListeners();
    return () => {
      recognizer.onEnabledChange = null;
      this.perEventRecognizers.delete(recognizer);
      const index = registration.recognizers.indexOf(recognizer);
      if (index >= 0) {
        registration.recognizers.splice(index, 1);
      }
      if (isHoverRecognizer(recognizer)) {
        const hoverIndex = registration.hovers.indexOf(recognizer);
        if (hoverIndex >= 0) {
          registration.hovers.splice(hoverIndex, 1);
        }
        recognizer.hoverExited();
      }
      // A recognizer whose view goes away mid-gesture is cancelled, as in
      // UIKit when a view leaves the window.
      if (recognizer.state !== 'possible' || recognizer.isInvolved()) {
        recognizer.cancel();
      }
      this.refresh(element, registration);
      this.cleanup(element, registration);
      // A registration that stays may have lost its last enabled member.
      this.syncListeners();
    };
  }

  /** Attach the view-level touch consumer of an element (a pressable control). */
  attachConsumer(
    element: Element,
    consumer: TouchConsumer,
    options: Pick<AttachOptions, 'perEventPointer'> = {},
  ): () => void {
    const registration = this.registrationFor(element);
    registration.consumer = consumer;
    if (options.perEventPointer === true) {
      this.perEventConsumers.add(consumer);
    } else if (!this.isCoarse) {
      this.warnFinePointer();
    }
    this.refresh(element, registration);
    this.syncListeners();
    return () => {
      this.perEventConsumers.delete(consumer);
      if (registration.consumer === consumer) {
        registration.consumer = null;
      }
      // A keepsTouch consumer's blocking touchmove goes with it, even while
      // the element keeps its recognizers.
      this.refresh(element, registration);
      this.cleanup(element, registration);
      // A registration that stays may have lost its last enabled member.
      this.syncListeners();
    };
  }

  /**
   * @internal The document this host serves.
   */
  get document(): Document {
    return this.doc;
  }

  /**
   * @internal Whether a recognizer owns the touch with this Touch Events
   * `identifier`, so the browser must not pan it (pageHold.ts asks).
   */
  isTouchClaimed(identifier: number): boolean {
    const id = this.touchIds.get(identifier);
    return id != null && this.arena.isClaimed(id);
  }

  /**
   * An element's box where it is drawn: the box the engine reports, moved
   * by the compositor animations of it and its ancestors on engines that
   * report and hit-test those where they started (iOS WebKit). Elsewhere
   * `getBoundingClientRect` already reports the drawn box. Press trackers
   * read their bounds through it.
   */
  presentedRect(element: Element): PressBounds {
    const box = element.getBoundingClientRect();
    if (!this.hitTestsLayout()) {
      return box;
    }
    const {x, y} = presentedOffsetOf(element);
    if (x === 0 && y === 0) {
      return box;
    }
    return {
      left: box.left + x,
      top: box.top + y,
      right: box.right + x,
      bottom: box.bottom + y,
    };
  }

  /** Whether this engine hit-tests a compositor-moved element at layout. */
  private hitTestsLayout(): boolean {
    return (
      this.presentedHitTesting === 'always' ||
      (this.presentedHitTesting === 'auto' && isIosWebKit(this.doc.defaultView))
    );
  }

  /**
   * Where a contact lands among what is drawn. iOS WebKit hit-tests an
   * element that a compositor animation moves where the animation started:
   * a finger on a settling sheet lands on whatever sat under the sheet's
   * start (the scrim, which closes it), and a finger where the sheet was
   * lands on the sheet. UIKit keeps an interruptible animation hit-testable
   * where it is drawn (UIViewPropertyAnimator).
   */
  private presentedTarget(
    native: EventTarget | null,
    x: number,
    y: number,
  ): EventTarget | null {
    if (!this.hitTestsLayout()) {
      return native;
    }
    const movers = presentedElements().filter(element => {
      if (!element.isConnected || element.ownerDocument !== this.doc) {
        return false;
      }
      const {x: dx, y: dy} = presentedOffsetOf(element);
      return Math.abs(dx) >= 0.5 || Math.abs(dy) >= 0.5;
    });
    if (movers.length === 0) {
      return native;
    }
    // One style write per mover makes the engine hit-test it where it is
    // drawn now; the hit test below flushes them. The engine then gets
    // z-order, pointer-events and clipping right, which no box math would.
    resolvePresented(movers);
    const hit = this.doc.elementFromPoint(x, y);
    if (hit == null || hit === native) {
      return native;
    }
    const node = native instanceof Node ? native : null;
    const isAboutMover = movers.some(
      mover => mover.contains(hit) || (node != null && mover.contains(node)),
    );
    return isAboutMover ? hit : native;
  }

  /** The browser took these touches (a scroll): no click of ours for them. */
  private browserTook(ids: ReadonlyArray<number>, time: number): void {
    for (const id of ids) {
      this.retargeted.delete(id);
    }
    this.arena.browserTookOver(ids, time);
  }

  /**
   * The click a retargeted tap earned, on what was drawn under the finger.
   * The engine's own click would hit the start position, so the caller
   * cancels it (or the swallower drops it, a late one included) and this one
   * is the tap's single activation.
   */
  private clickRetargeted(target: EventTarget, x: number, y: number): void {
    const view = this.doc.defaultView;
    if (!(target instanceof Element) || !target.isConnected || view == null) {
      return;
    }
    this.armSwallower();
    if (
      target instanceof view.HTMLElement &&
      target.matches('input, textarea, select, [contenteditable]')
    ) {
      target.focus();
    }
    target.dispatchEvent(
      new view.MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        composed: true,
        detail: 1,
        clientX: x,
        clientY: y,
      }),
    );
  }

  /**
   * Re-derive an element's styles and the host's listeners after its
   * recognizers' options or its consumer's enabled state changed.
   */
  update(element: Element): void {
    if (!this.followsPointer) {
      // A read passed in (a test's) is not followed: an update reads it again.
      this.isCoarse = this.isPrimaryPointerCoarse();
    }
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
    window: number = UIKIT_PRESS.scrollBrake.value,
  ): boolean {
    const last = this.lastScroll;
    return (
      last != null &&
      this.arena.now() - last.time < window &&
      last.scroller.contains(node)
    );
  }

  /**
   * @internal Keep the host's listeners installed until the returned
   * function runs, with no recognizer attached (fingerScroll.ts reads the
   * finger record meanwhile).
   */
  retain(): () => void {
    this.retainers += 1;
    // A watch is not an attach: no warning where the pointer is fine.
    this.watchPointer();
    this.syncListeners();
    let isRetained = true;
    return () => {
      if (!isRetained) {
        return;
      }
      isRetained = false;
      this.retainers -= 1;
      this.uninstallIfIdle();
    };
  }

  /**
   * @internal Call `listener` after each touch event the host hears, once
   * the finger record is up to date. Returns the unsubscribe.
   */
  onFingersChange(listener: () => void): () => void {
    this.fingerListeners.add(listener);
    return () => {
      this.fingerListeners.delete(listener);
    };
  }

  /** @internal Whether a finger that landed inside `node` is down now. */
  isFingerDownIn(node: Node): boolean {
    return this.fingerTargets.some(target => node.contains(target));
  }

  private registrationFor(element: Element): Registration {
    this.watchPointer();
    let registration = this.registry.get(element);
    if (registration == null) {
      registration = {
        recognizers: [],
        hovers: [],
        consumer: null,
        hasTouchMoveListener: false,
        savedStyle: new Map(),
        authorTouchAction: null,
        manageStyle: true,
      };
      this.registry.set(element, registration);
    }
    return registration;
  }

  /**
   * Whether `recognizer` takes input now: where the primary pointer is
   * coarse, or with `perEventPointer` (FR19; `spec:AST-057`).
   */
  private isActive(recognizer: GestureRecognizer): boolean {
    return this.isCoarse || this.perEventRecognizers.has(recognizer);
  }

  /**
   * Whether a press consumer takes input now (FR19; its per-event opt-in,
   * an FR19 exception for press feedback pending in AST-094's amendment).
   */
  private isConsumerActive(consumer: TouchConsumer): boolean {
    return this.isCoarse || this.perEventConsumers.has(consumer);
  }

  /** Whether anything attached takes input now. */
  private needsInput(): boolean {
    return (
      this.isCoarse ||
      this.perEventRecognizers.size > 0 ||
      this.perEventConsumers.size > 0
    );
  }

  private refresh(element: Element, registration: Registration): void {
    if (registration.manageStyle && element instanceof HTMLElement) {
      this.applyStyle(element, registration);
    }
    // Where the primary pointer is fine, no touch listener but a
    // perEventPointer recognizer's (FR19).
    const needsListener =
      registration.recognizers.some(
        recognizer =>
          this.isActive(recognizer) &&
          recognizer.isEnabled &&
          claimsWhileMoving(recognizer),
      ) ||
      // A kept press holds its touch only where the pointer is coarse; a
      // per-event tracker elsewhere gives press feedback only (FR19).
      (registration.consumer?.keepsTouch != null &&
        registration.consumer.isEnabled?.() !== false &&
        this.isCoarse);
    // The blocking listener sits on the element itself (FR19: a scroll that
    // starts elsewhere never waits on it), but every element shares the
    // host's one handler, which routes through the arena.
    if (needsListener && !registration.hasTouchMoveListener) {
      element.addEventListener('touchmove', this.onBlockingTouchMove, {
        passive: false,
      });
      registration.hasTouchMoveListener = true;
    } else if (!needsListener && registration.hasTouchMoveListener) {
      element.removeEventListener('touchmove', this.onBlockingTouchMove);
      registration.hasTouchMoveListener = false;
    }
  }

  private applyStyle(element: HTMLElement, registration: Registration): void {
    // Where the primary pointer is fine, the browser's own styles, but a
    // perEventPointer recognizer's (FR19).
    // A disabled recognizer leaves the browser everything (FR24).
    const active = registration.recognizers.filter(
      recognizer => recognizer.isEnabled && this.isActive(recognizer),
    );
    let style: GestureHostStyle =
      active.length > 0 ? gestureHostStyle(active) : {};
    // A control that keeps its touch (a stepper's hold-repeat) takes taps in
    // quick succession: where the pointer is coarse, the browser's double-tap
    // zoom goes, as for a tap recognizer (`spec:AST-094` FR18); where it is
    // fine, the browser keeps its own value (FR19).
    if (
      style.touchAction == null &&
      this.isCoarse &&
      registration.consumer?.keepsTouch != null
    ) {
      style = {...style, touchAction: 'manipulation'};
    }
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
   *   writes what both allow, inline;
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
    if (inline !== '') {
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
    if (
      registration.recognizers.length > 0 ||
      registration.hovers.length > 0 ||
      registration.consumer != null
    ) {
      return;
    }
    if (registration.hasTouchMoveListener) {
      element.removeEventListener('touchmove', this.onBlockingTouchMove);
    }
    this.registry.delete(element);
    this.uninstallIfIdle();
  }

  /**
   * Listen only while something could take a touch now (`spec:AST-094`
   * FR19, FR24): an enabled recognizer or consumer that takes input (where
   * the primary pointer is coarse, or one attached with `perEventPointer`),
   * or a finger-scroll watch.
   * Otherwise no document listener is registered, so a desktop page and a
   * disabled control pay nothing.
   */
  private syncListeners(): void {
    if (this.shouldListen()) {
      this.install();
    } else {
      this.uninstall();
    }
    this.syncMoverBlocking();
  }

  /**
   * Safari honours a blocking `touchmove` only where it was registered before
   * the touch began, on the engine's own target, and on iOS WebKit a finger
   * on an element a compositor animation moves lands, for the engine, on
   * whatever sits under the motion's start (see presentedTarget). So while an
   * element a recognizer that claims moving touches lives in (or around) is
   * moving, the document carries the blocking listener (`spec:AST-094`
   * FR19), and it comes off when the motion ends: only then does a scroll
   * starting anywhere wait on the main thread.
   */
  private syncMoverBlocking(): void {
    const isWatching = this.isInstalled && this.hitTestsLayout();
    if (isWatching && this.stopWatchingMovers == null) {
      this.stopWatchingMovers = watchPresentedElements(() =>
        this.syncMoverBlocking(),
      );
    } else if (!isWatching && this.stopWatchingMovers != null) {
      this.stopWatchingMovers();
      this.stopWatchingMovers = null;
    }
    const needed =
      isWatching &&
      presentedElements().some(mover =>
        this.hasClaimingRecognizerAround(mover),
      );
    if (needed === this.isBlockingForMovers) {
      return;
    }
    this.isBlockingForMovers = needed;
    if (needed) {
      this.doc.addEventListener('touchmove', this.onBlockingTouchMove, {
        passive: false,
      });
    } else {
      this.doc.removeEventListener('touchmove', this.onBlockingTouchMove);
    }
  }

  /** Whether a recognizer that claims moving touches lives in or around `mover`. */
  private hasClaimingRecognizerAround(mover: Element): boolean {
    if (!mover.isConnected || mover.ownerDocument !== this.doc) {
      return false;
    }
    for (const [element, registration] of this.registry) {
      if (
        (mover.contains(element) || element.contains(mover)) &&
        registration.recognizers.some(
          recognizer => recognizer.isEnabled && claimsWhileMoving(recognizer),
        )
      ) {
        return true;
      }
    }
    return false;
  }

  /** With nothing attached, stop listening and stop following the pointer. */
  private uninstallIfIdle(): void {
    this.syncListeners();
    if (this.registry.size === 0 && this.retainers === 0) {
      this.uninstall();
      this.stopWatchingPointer?.();
      this.stopWatchingPointer = null;
    }
  }

  /** Read the primary pointer, and follow it while anything is attached. */
  private watchPointer(): void {
    if (this.stopWatchingPointer != null) {
      return;
    }
    const view = this.doc.defaultView;
    this.isCoarse = this.isPrimaryPointerCoarse();
    this.stopWatchingPointer = this.followsPointer
      ? watchCoarsePointer(view, isCoarse => this.pointerChanged(isCoarse))
      : () => {};
  }

  /**
   * The primary pointer turned coarse or fine (a tablet docking a mouse):
   * install or remove everything, as if each attach happened now.
   */
  private pointerChanged(isCoarse: boolean): void {
    if (isCoarse === this.isCoarse) {
      return;
    }
    this.isCoarse = isCoarse;
    if (!isCoarse) {
      this.cancelEverything(this.arena.now());
    }
    for (const [element, registration] of this.registry) {
      this.refresh(element, registration);
    }
    this.syncListeners();
  }

  /** Something attached where the primary pointer is fine: say so once. */
  private warnFinePointer(): void {
    if (process.env.NODE_ENV !== 'production' && !this.hasWarnedFinePointer) {
      this.hasWarnedFinePointer = true;
      console.warn(
        'Astryx: a gesture recognizer or press tracker was attached where ' +
          'the primary pointer is fine. It stays inactive until the pointer ' +
          'is coarse (spec:AST-094 FR19), so attach touch work only under a ' +
          'touch presentation, or pass perEventPointer for a recognizer or ' +
          "press tracker that reads each event's pointer itself (spec:AST-057).",
      );
    }
  }

  private shouldListen(): boolean {
    if (!this.needsInput()) {
      return false;
    }
    if (this.retainers > 0) {
      return true;
    }
    for (const registration of this.registry.values()) {
      const consumer = registration.consumer;
      if (
        (consumer != null &&
          consumer.isEnabled?.() !== false &&
          this.isConsumerActive(consumer)) ||
        registration.recognizers.some(
          recognizer => recognizer.isEnabled && this.isActive(recognizer),
        ) ||
        (this.isCoarse && registration.hovers.some(r => r.isEnabled))
      ) {
        return true;
      }
    }
    return false;
  }

  // --- Listeners -------------------------------------------------------------

  private install(): void {
    this.watchPointer();
    if (!this.needsInput()) {
      return;
    }
    if (this.isInstalled) {
      return;
    }
    const view = this.doc.defaultView;
    this.isInstalled = true;
    this.usesTouchEvents =
      this.inputMode === 'auto' && view != null && 'ontouchstart' in view;
    if (view == null) {
      // A document without a window receives no input.
      return;
    }
    // The window's capture phase, through the shared input stream
    // (utils/inputStream.ts): the earliest point a page can intercept input,
    // so an app's capture-phase stopPropagation at the document starves no
    // recognizer, as UIKit's recognizers see touches before views do. Only
    // the listeners that cancel are non-passive; none of them is a
    // touchstart or touchmove, so none of them holds a scroll.
    this.unsubscribers = [
      subscribeInput(view, 'touchstart', this.onTouchStart),
      subscribeInput(view, 'touchmove', this.onTouchMove),
      subscribeInput(view, 'touchend', this.onTouchEnd, {cancels: true}),
      subscribeInput(view, 'touchcancel', this.onTouchCancel),
      subscribeInput(view, 'pointerdown', this.onPointerDown),
      subscribeInput(view, 'pointermove', this.onPointerMove),
      subscribeInput(view, 'pointerup', this.onPointerUp),
      subscribeInput(view, 'pointercancel', this.onPointerCancel),
      subscribeInput(view, 'pointerout', this.onPointerOut),
      subscribeInput(view, 'contextmenu', this.onContextMenu, {cancels: true}),
      subscribeInput(view, 'scroll', this.onScroll),
      subscribeInput(view, 'visibilitychange', this.onVisibilityChange),
      subscribeInput(view, 'click', this.onClick, {cancels: true}),
      // The window's own blur; an element's blur (a Node's) reaches the
      // window's capture phase too and means nothing here.
      subscribeInput(view, 'blur', event => {
        if (!(event.target instanceof view.Node)) {
          this.onBlur();
        }
      }),
    ];
  }

  private uninstall(): void {
    if (!this.isInstalled) {
      return;
    }
    this.isInstalled = false;
    // Unheard from here on: no fingers to keep.
    this.fingerTargets = [];
    for (const unsubscribe of this.unsubscribers.splice(0)) {
      unsubscribe();
    }
    this.cancelEverything(this.arena.now());
    this.lastTouch = null;
    this.lastScroll = null;
  }

  // --- Hit path --------------------------------------------------------------

  /**
   * The recognizers on the path from `target` to the document, innermost
   * first, and (for a contact) its consumer: the innermost element with an
   * attached consumer.
   */
  private participantsAt(
    target: unknown,
    pointerType: PointerKind | null,
  ): {
    recognizers: GestureRecognizer[];
    consumer: TouchConsumer | null;
    consumerElement: Element | null;
    hovers: HoverGestureRecognizer[];
  } {
    const recognizers: GestureRecognizer[] = [];
    const hovers: HoverGestureRecognizer[] = [];
    let consumer: TouchConsumer | null = null;
    let consumerElement: Element | null = null;
    if (
      target instanceof Node &&
      [...this.touchGates].some(gate => gate(target))
    ) {
      return {recognizers, consumer, consumerElement, hovers};
    }
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
        // Where the primary pointer is fine, only perEventPointer
        // recognizers take part (FR19; `spec:AST-057`).
        recognizers.push(
          ...registration.recognizers.filter(recognizer =>
            this.isActive(recognizer),
          ),
        );
        if (this.isCoarse) {
          hovers.push(...registration.hovers);
        }
      }
      if (hasConsumerOwner || pointerType == null) {
        continue;
      }
      // Where the primary pointer is fine, only a perEventPointer consumer
      // takes part (FR19); an inactive one is as if absent.
      if (
        registration?.consumer != null &&
        this.isConsumerActive(registration.consumer) &&
        // Where the pointer is fine its press feedback is for a finger only:
        // a mouse or a pen there keeps the desktop's own handling (FR19).
        (this.isCoarse || pointerType === 'touch')
      ) {
        consumer = registration.consumer;
        consumerElement = node;
        hasConsumerOwner = true;
        continue;
      }
    }
    return {recognizers, consumer, consumerElement, hovers};
  }

  /**
   * Turn text selection and the touch callout off, for as long as this
   * finger or pen is down, only on the elements whose hold does something:
   * a long press's (a menu, a hold-repeat), those of recognizers created
   * with a `selectionLock` (a slider's thumb, a switch's drag, a tab bar's
   * zero-delay lens) and that of a press tracker created with one (a
   * stepper's hold-repeat). Anything whose hold does nothing, a plain
   * press-tracked control or row included, keeps the browser's long-press
   * selection (`spec:AST-094` FR41). Restored when the contact ends. Callers
   * lock only where the primary pointer is coarse (locksSelectionFor), so
   * desktop selection is untouched, and only once the arena has admitted
   * the contact: `recognizers` and `consumer` are the ones that took it.
   */
  private lockSelection(
    id: number,
    recognizers: ReadonlyArray<GestureRecognizer>,
    target: EventTarget | null,
    consumer: TouchConsumer | null,
    consumerElement: Element | null,
  ): void {
    // Each recognizer whose hold does something brings its lock; the host
    // never imports one (a component without such a hold does not bundle
    // it). Only one that took this contact locks for it: a recognizer that
    // declined it (its pointer, or its own shouldReceiveTouch) has no hold
    // here.
    const byLock = new Map<SelectionLock, Set<Element>>();
    for (const recognizer of recognizers) {
      const lock = recognizer.selectionLock;
      if (lock != null && recognizer.view instanceof Element) {
        const elements = byLock.get(lock) ?? new Set<Element>();
        elements.add(recognizer.view);
        byLock.set(lock, elements);
      }
    }
    const consumerLock = consumer?.selectionLock;
    if (consumerLock != null && consumerElement != null) {
      const elements = byLock.get(consumerLock) ?? new Set<Element>();
      elements.add(consumerElement);
      byLock.set(consumerLock, elements);
    }
    if (byLock.size > 0) {
      const undo = [...byLock].map(([lock, elements]) =>
        lock(elements, target),
      );
      this.lockedBy.set(id, () => {
        for (const release of undo) {
          release();
        }
      });
    }
  }

  /** Undo `lockSelection` for a contact that ended; idempotent. */
  private unlockSelection(id: number): void {
    this.lockedBy.get(id)?.();
    this.lockedBy.delete(id);
  }

  // --- Touch events ----------------------------------------------------------

  /**
   * Hold touches away from every participant while `gate(target)` answers
   * true (a presentation running in a layer: its content takes no touch
   * until it settles). Returns the release.
   */
  addTouchGate(gate: (target: Node) => boolean): () => void {
    this.touchGates.add(gate);
    return () => {
      this.touchGates.delete(gate);
    };
  }

  /**
   * How many fingers are on the screen: the length of `touches` in the last
   * touch event the host's listeners heard (`touchstart`, `touchmove`,
   * `touchend`, `touchcancel`), whatever its target, so a finger on an
   * element with no recognizer counts too. 0 before any, and while no
   * listener is installed. A recognizer that must not begin under a second
   * finger reads it in `shouldBegin`.
   */
  fingersDown(): number {
    return this.fingerTargets.length;
  }

  /** Whether this event is new to the host (and mark it handled). */
  private takeEvent(event: Event): boolean {
    if (this.processed.has(event)) {
      return false;
    }
    this.processed.add(event);
    return true;
  }

  private readonly onTouchStart = (event: TouchEvent): void => {
    this.noteFingersDown(event);
    if (!this.takeEvent(event)) {
      return;
    }
    if (this.fingerTargets.length > 1) {
      this.failUnclaimedLoneFingerPans();
    }
    const time = eventTime(event);
    const inputs: ArenaBeganInput[] = [];
    const untracked: TouchBeganInput[] = [];
    const stale: number[] = [];
    // Locked once the arena knows which recognizers took each finger.
    const toLock: {
      id: number;
      target: EventTarget | null;
      consumerElement: Element | null;
    }[] = [];
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
      const native = touch.target instanceof Node ? touch.target : event.target;
      const target = this.presentedTarget(native, touch.clientX, touch.clientY);
      const {recognizers, consumer, consumerElement} = this.participantsAt(
        target,
        'touch',
      );
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
      if (locksSelectionFor('touch', this.doc.defaultView)) {
        toLock.push({id, target, consumerElement});
      }
      // The finger's events keep going to what the engine hit.
      this.watchTarget(
        touch.identifier,
        native,
        recognizers.some(claimsWhileMoving) ||
          (this.isCoarse && consumer?.keepsTouch != null),
      );
      this.lastFed.set(id, {x: touch.clientX, y: touch.clientY, time});
      this.pairTouch(id, {x: touch.clientX, y: touch.clientY, target: native});
      if (target !== native && target != null) {
        this.retargeted.set(id, {x: touch.clientX, y: touch.clientY, target});
      }
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
        // Where the pointer is fine only per-event participants hear it, and
        // a press tracker among them gives press feedback only (FR19).
        ...(this.isCoarse ? {} : {isFeedbackOnly: true}),
      });
    }
    if (stale.length > 0) {
      this.arena.cancelled(stale, time);
    }
    this.arena.began(inputs);
    for (const {id, target, consumerElement} of toLock) {
      this.lockSelection(
        id,
        this.arena.participantsOf(id),
        target,
        this.arena.consumerOf(id) ?? null,
        consumerElement,
      );
    }
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
    this.noteFingersDown(event);
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
        this.browserTook(taken, time);
      }
    }
    // A finger its pointer events sample is fed from there, never from here.
    this.feedMoves(inputs.filter(input => !this.pointerFed.has(input.id)));
  };

  /** The one blocking `touchmove` handler every claiming element shares. */
  private readonly onBlockingTouchMove = (event: Event): void => {
    this.cancelIfClaimed(event as TouchEvent);
  };

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
      const id = this.touchIds.get(touch.identifier);
      if (
        id != null &&
        (this.arena.isClaimed(id) ||
          (this.isCoarse &&
            this.arena.consumerOf(id)?.keepsTouch?.(id) === true))
      ) {
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
    this.noteFingersDown(event);
    if (!this.takeEvent(event)) {
      return;
    }
    this.dropFingersNotDown(event);
    const time = eventTime(event);
    const inputs: TouchInput[] = [];
    const retargetedEnds: {
      id: number;
      landed: {x: number; y: number; target: EventTarget};
      x: number;
      y: number;
    }[] = [];
    for (const touch of touchesOf(event.changedTouches)) {
      const tracked = this.touchIds.get(touch.identifier);
      const landed = tracked == null ? undefined : this.retargeted.get(tracked);
      const id = this.forgetFinger(touch.identifier);
      if (id == null) {
        continue;
      }
      inputs.push({id, x: touch.clientX, y: touch.clientY, time});
      if (landed != null) {
        retargetedEnds.push({id, landed, x: touch.clientX, y: touch.clientY});
      }
    }
    // The lift is when momentum starts: the clock the brake wants most.
    if (event.target instanceof Node) {
      this.lastTouch = {target: event.target, time};
    }
    if (inputs.length === 0) {
      return;
    }
    const dispositions = this.arena.ended(inputs);
    let cancelsClick = needsSuppression(dispositions);
    // A tap sent to what is drawn: the engine's click would hit the layout
    // position, so it is cancelled and the tap clicks what it touched.
    for (const end of retargetedEnds) {
      if (this.clickRetargetedTap(end.landed, end, dispositions.get(end.id))) {
        cancelsClick = true;
      }
    }
    if (cancelsClick) {
      if (event.cancelable) {
        event.preventDefault();
      }
      this.armSwallower();
    }
  };

  /**
   * Clicks what a retargeted contact touched if it ended as a tap the
   * engine would click: nothing claimed it, the browser did not take it
   * (a taken contact is no longer retargeted), and the finger stayed within
   * a tap's movement. Returns whether it clicked.
   */
  private clickRetargetedTap(
    landed: {x: number; y: number; target: EventTarget} | undefined,
    end: {x: number; y: number},
    disposition: ClickDisposition | undefined,
  ): boolean {
    if (landed == null || disposition !== 'allow') {
      return false;
    }
    const moved = Math.hypot(end.x - landed.x, end.y - landed.y);
    if (moved > UIKIT_TAP.allowableMovement.value) {
      return false;
    }
    this.clickRetargeted(landed.target, end.x, end.y);
    return true;
  }

  private readonly onTouchCancel = (event: TouchEvent): void => {
    this.noteFingersDown(event);
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
        this.pointerFed.add(id);
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
        this.pointerFed.add(id);
        return;
      }
    }
    this.pendingPointers.set(pointerId, place);
  }

  /** Feed moves from a contact's sampling channel, in time order. */
  private feedMoves(inputs: ReadonlyArray<TouchInput>): void {
    const fresh = inputs.filter(input => {
      const last = this.lastFed.get(input.id);
      if (last != null && input.time < last.time) {
        return false;
      }
      this.lastFed.set(input.id, {x: input.x, y: input.y, time: input.time});
      return true;
    });
    if (fresh.length > 0) {
      this.arena.moved(fresh);
    }
  }

  /** Forget a contact's pairing and echo state. */
  private forgetContact(id: number): void {
    this.unlockSelection(id);
    this.retargeted.delete(id);
    this.lastFed.delete(id);
    this.pointerFed.delete(id);
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
    this.exitHover(event.pointerId);
    if (event.pointerType === 'touch' && this.usesTouchEvents) {
      this.pairPointer(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
        target: event.target,
      });
      return;
    }
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    const target = this.presentedTarget(
      event.target,
      event.clientX,
      event.clientY,
    );
    const {recognizers, consumer, consumerElement} = this.participantsAt(
      target,
      event.pointerType,
    );
    if (recognizers.length === 0 && consumer == null) {
      return;
    }
    const id = this.nextId++;
    this.pointerIds.set(event.pointerId, id);
    if (target !== event.target && target != null) {
      this.retargeted.set(id, {x: event.clientX, y: event.clientY, target});
    }
    this.arena.began([
      {
        id,
        x: event.clientX,
        y: event.clientY,
        time: eventTime(event),
        pointerType: event.pointerType,
        target,
        scroll: createNativeScrollProbe(target),
        recognizers,
        consumer,
        ...(this.isCoarse ? {} : {isFeedbackOnly: true}),
      },
    ]);
    if (locksSelectionFor(event.pointerType, this.doc.defaultView)) {
      // The presented target: what the pen is on, where the engine's own
      // hit test may still see the motion's start.
      this.lockSelection(
        id,
        this.arena.participantsOf(id),
        target,
        this.arena.consumerOf(id) ?? null,
        consumerElement,
      );
    }
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
    if (event.pointerType !== 'touch' && event.buttons === 0) {
      this.updateHover(event);
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
      return;
    }
    this.pointerIds.delete(event.pointerId);
    this.unlockSelection(id);
    const dispositions = this.arena.ended([
      {id, x: event.clientX, y: event.clientY, time: eventTime(event)},
    ]);
    // A retargeted tap's own click arms the swallower for the engine's.
    const landed = this.retargeted.get(id);
    this.retargeted.delete(id);
    const clicked = this.clickRetargetedTap(
      landed,
      {x: event.clientX, y: event.clientY},
      dispositions.get(id),
    );
    if (!clicked && needsSuppression(dispositions)) {
      this.armSwallower();
    }
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerType === 'touch' && this.usesTouchEvents) {
      const id =
        this.fingerPointers.get(event.pointerId) ??
        this.touchForCancelledPointer(event);
      this.fingerPointers.delete(event.pointerId);
      this.pendingPointers.delete(event.pointerId);
      if (id != null) {
        // The pointer channel ends here while the finger keeps moving (the
        // browser scrolls with it): its touch events, now the only channel,
        // sample it, as a scroll handoff needs.
        this.pointerFed.delete(id);
        this.browserTook([id], eventTime(event));
      }
      return;
    }
    const id = this.pointerIds.get(event.pointerId);
    if (id != null) {
      this.pointerIds.delete(event.pointerId);
      this.unlockSelection(id);
      this.retargeted.delete(id);
      this.arena.cancelled([id], eventTime(event));
    }
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

  // --- Hover -------------------------------------------------------------------

  private updateHover(event: PointerEvent): void {
    if (!isPointerKind(event.pointerType)) {
      return;
    }
    const {hovers} = this.participantsAt(event.target, null);
    const next = new Set(hovers.filter(hover => hover.isEnabled));
    const previous = this.hovered.get(event.pointerId) ?? new Set();
    if (next.size === 0 && previous.size === 0) {
      return;
    }
    const point = {x: event.clientX, y: event.clientY};
    for (const hover of previous) {
      if (!next.has(hover)) {
        hover.hoverExited(point);
      }
    }
    for (const hover of next) {
      if (previous.has(hover)) {
        hover.hoverMoved(point);
      } else {
        hover.hoverEntered(point, event.pointerType);
      }
    }
    if (next.size === 0) {
      this.hovered.delete(event.pointerId);
    } else {
      this.hovered.set(event.pointerId, next);
    }
  }

  private exitHover(pointerId: number): void {
    const hovers = this.hovered.get(pointerId);
    if (hovers == null) {
      return;
    }
    this.hovered.delete(pointerId);
    for (const hover of hovers) {
      hover.hoverExited();
    }
  }

  private readonly onPointerOut = (event: PointerEvent): void => {
    if (event.relatedTarget == null) {
      this.exitHover(event.pointerId);
    }
  };

  // --- Clicks, menus, scrolls, focus -----------------------------------------

  private armSwallower(): void {
    this.swallowDeadline =
      browserClock.now() + UIKIT_CLICK.strayClickWindow.value;
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
      time - last.time < UIKIT_PRESS.momentumMemory.value &&
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
        // one only once the finger has travelled its slop. A scroll under a
        // finger that has not (scrollIntoView, a transcript pinned to its
        // end, scroll anchoring) is the page's own: the touch, and the click
        // it earns, stay where they are.
        Math.hypot(touch.x - touch.startX, touch.y - touch.startY) >=
          UIKIT_PRESS.slop.value
      ) {
        taken.push(touch.id);
      }
    }
    if (taken.length > 0) {
      this.browserTook(taken, time);
    }
  };

  private noteFingersDown(event: TouchEvent): void {
    const fingers: Node[] = [];
    for (const touch of touchesOf(event.touches)) {
      if ((touch as StylusTouch).touchType !== 'stylus') {
        if (touch.target instanceof Node) {
          fingers.push(touch.target);
        }
      }
    }
    this.fingerTargets = fingers;
    for (const listener of [...this.fingerListeners]) {
      listener();
    }
  }

  /**
   * A second finger landed somewhere (wherever: often on a plain row): a
   * pan that takes one finger only and has not claimed its touch fails, so
   * the two fingers stay the browser's pinch (WCAG 1.4.4) instead of the
   * pan claiming them midway. A drag a recognizer has claimed keeps its
   * finger: a second finger never cancels or redirects it (`spec:AST-094`
   * FR10), and no claim is released here.
   */
  private failUnclaimedLoneFingerPans(): void {
    for (const recognizer of [...this.arena.involvedRecognizers]) {
      if (
        isPanRecognizer(recognizer) &&
        recognizer.state === 'possible' &&
        recognizer.maximumNumberOfTouches === 1 &&
        recognizer.trackedTouches.length > 0 &&
        recognizer.trackedTouches.every(
          touch =>
            touch.pointerType === 'touch' && !this.arena.isClaimed(touch.id),
        )
      ) {
        recognizer.cancel();
      }
    }
  }

  private readonly onVisibilityChange = (): void => {
    if (this.doc.visibilityState === 'hidden') {
      this.cancelEverything(this.arena.now());
    }
  };

  private readonly onBlur = (): void => {
    this.cancelEverything(this.arena.now());
  };

  /** The app lost focus: UIKit cancels every touch in flight. */
  private cancelEverything(time: number): void {
    const ids = [...this.pointerIds.values()];
    for (const id of ids) {
      this.unlockSelection(id);
    }
    for (const identifier of [...this.touchIds.keys()]) {
      const id = this.forgetFinger(identifier);
      if (id != null) {
        ids.push(id);
      }
    }
    this.pointerIds.clear();
    this.retargeted.clear();
    this.fingerPointers.clear();
    this.pendingPointers.clear();
    this.unpairedTouches.clear();
    this.lastFed.clear();
    this.pointerFed.clear();
    if (ids.length > 0) {
      this.arena.cancelled(ids, time);
    }
    for (const pointerId of [...this.hovered.keys()]) {
      this.exitHover(pointerId);
    }
  }
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

/**
 * iOS WebKit, by the one property only it implements (the engine check of
 * utils/touchPresentation.ts, which this module cannot import: it brings
 * React).
 */
function isIosWebKit(
  view: (Window & {CSS?: Partial<typeof CSS>}) | null,
): boolean {
  return view?.CSS?.supports?.('-webkit-touch-callout', 'none') === true;
}

/** The gesture host of a document, created on first use. */
export function getGestureHost(doc: Document): GestureHost {
  let host = gestureHosts.get(doc);
  if (host == null) {
    host = new GestureHost(doc);
    gestureHosts.set(doc, host);
  }
  return host;
}
