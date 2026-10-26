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
 *   pan, a swipe, a long press that then drags, a pinch, a rotation) gets a
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
import {HoverGestureRecognizer} from './HoverGestureRecognizer';
import {TapGestureRecognizer} from './TapGestureRecognizer';
import {createNativeScrollProbe, parentAcrossShadow} from './nativeScroll';
import {
  gestureHostStyle,
  holdSelectionStyle,
  type GestureHostStyle,
} from './touchAction';
import type {
  GestureEnvironment,
  GestureTouch,
  PointerKind,
  TouchConsumer,
  TouchInput,
  TouchSample,
} from './types';

interface Registration {
  readonly recognizers: GestureRecognizer[];
  readonly hovers: HoverGestureRecognizer[];
  consumer: TouchConsumer | null;
  touchMoveListener: EventListener | null;
  /** Inline values the host replaced, to restore on detach. */
  readonly savedStyle: Map<string, string>;
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
   * Whether the primary pointer is coarse (a phone, a tablet). Where it is
   * fine, the host registers no listener at all (`spec:AST-094` FR19, FR24).
   * @default `(pointer: coarse)` on the document's window
   */
  isPrimaryPointerCoarse?: () => boolean;
}

export interface AttachOptions {
  /** Let the host set touch-action (and long-press callout) styles. @default true */
  manageStyle?: boolean;
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
  return (
    recognizer.acceptsTouchInput &&
    !(recognizer instanceof TapGestureRecognizer)
  );
}

const PASSIVE_CAPTURE = {capture: true, passive: true} as const;

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
   * travelled its slop (about 16 px), but sends every `pointermove`, so the
   * finger's movement comes from both channels; and its `pointercancel` is
   * the browser's claim of exactly that finger.
   */
  private readonly fingerPointers = new Map<number, number>();
  /** Finger pointerdowns still waiting for their touchstart. */
  private readonly pendingPointers = new Map<number, PlacedContact>();
  /** Fingers still waiting for their pointerdown, by arena id. */
  private readonly unpairedTouches = new Map<number, PlacedContact>();
  /** The last position fed per contact, so one channel's echo is dropped. */
  /** The elements each held contact turned selection off on. */
  private readonly heldSelectionBy = new Map<number, HTMLElement[]>();
  private readonly isPrimaryPointerCoarse: () => boolean;
  private readonly lastFed = new Map<number, TouchSample>();
  private readonly hovered = new Map<number, Set<HoverGestureRecognizer>>();
  /** When a finger was last down or lifted, and where it landed. */
  private lastTouch: {readonly target: Node; readonly time: number} | null =
    null;
  /** The last scroll a finger drove, and when. */
  private lastScroll: {readonly scroller: Node; readonly time: number} | null =
    null;
  private nextId = 1;
  private isInstalled = false;
  private readonly inputMode: 'auto' | 'pointer-events';
  private usesTouchEvents = true;
  private swallowDeadline = Number.NEGATIVE_INFINITY;

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
    // The primary pointer can change (a tablet's keyboard attached or
    // removed): styles and listeners follow it.
    coarseQuery?.addEventListener?.('change', () => this.refreshAll());
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
    recognizer.view = element;
    if (recognizer instanceof HoverGestureRecognizer) {
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
      const index = registration.recognizers.indexOf(recognizer);
      if (index >= 0) {
        registration.recognizers.splice(index, 1);
      }
      if (recognizer instanceof HoverGestureRecognizer) {
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
    };
  }

  /** Attach the view-level touch consumer of an element (a pressable control). */
  attachConsumer(element: Element, consumer: TouchConsumer): () => void {
    const registration = this.registrationFor(element);
    registration.consumer = consumer;
    this.syncListeners();
    return () => {
      if (registration.consumer === consumer) {
        registration.consumer = null;
      }
      this.cleanup(element, registration);
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
        hovers: [],
        consumer: null,
        touchMoveListener: null,
        savedStyle: new Map(),
        manageStyle: true,
      };
      this.registry.set(element, registration);
    }
    return registration;
  }

  private refresh(element: Element, registration: Registration): void {
    if (registration.manageStyle && element instanceof HTMLElement) {
      this.applyStyle(element, registration);
    }
    const needsListener =
      this.isPrimaryPointerCoarse() &&
      registration.recognizers.some(r => r.isEnabled && claimsWhileMoving(r));
    if (needsListener && registration.touchMoveListener == null) {
      const listener: EventListener = event =>
        this.cancelIfClaimed(event as TouchEvent);
      registration.touchMoveListener = listener;
      element.addEventListener('touchmove', listener, {passive: false});
    } else if (!needsListener && registration.touchMoveListener != null) {
      element.removeEventListener('touchmove', registration.touchMoveListener);
      registration.touchMoveListener = null;
    }
  }

  private applyStyle(element: HTMLElement, registration: Registration): void {
    // Where the primary pointer is fine, or no attached recognizer is
    // enabled, the host manages no style: the element keeps its own
    // touch-action (spec:AST-094 FR19); any value set before is restored.
    // A disabled recognizer leaves the browser everything too.
    const style: GestureHostStyle = this.isPrimaryPointerCoarse()
      ? gestureHostStyle(registration.recognizers.filter(r => r.isEnabled))
      : {};
    for (const key of Object.keys(
      STYLE_PROPERTIES,
    ) as (keyof GestureHostStyle)[]) {
      const property = STYLE_PROPERTIES[key];
      const value = style[key];
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

  private cleanup(element: Element, registration: Registration): void {
    if (
      registration.recognizers.length > 0 ||
      registration.hovers.length > 0 ||
      registration.consumer != null
    ) {
      return;
    }
    if (registration.touchMoveListener != null) {
      element.removeEventListener('touchmove', registration.touchMoveListener);
    }
    this.registry.delete(element);
    this.syncListeners();
  }

  /**
   * Listen only while something could take a touch: the primary pointer is
   * coarse and an enabled recognizer or an enabled consumer is attached (`spec:AST-094` FR19, FR24). Otherwise no document listener is
   * registered, so a desktop page pays nothing.
   */
  private syncListeners(): void {
    if (this.shouldListen()) {
      this.install();
    } else if (this.isInstalled) {
      this.uninstall();
    }
  }

  private shouldListen(): boolean {
    if (!this.isPrimaryPointerCoarse()) {
      return false;
    }
    for (const registration of this.registry.values()) {
      if (
        (registration.consumer != null &&
          registration.consumer.isEnabled?.() !== false) ||
        registration.recognizers.some(r => r.isEnabled) ||
        registration.hovers.some(r => r.isEnabled)
      ) {
        return true;
      }
    }
    return false;
  }

  // --- Listeners -------------------------------------------------------------

  private install(): void {
    if (this.isInstalled) {
      return;
    }
    const view = this.doc.defaultView;
    this.isInstalled = true;
    this.usesTouchEvents =
      this.inputMode === 'auto' && view != null && 'ontouchstart' in view;
    const doc = this.doc;
    doc.addEventListener('touchstart', this.onTouchStart, PASSIVE_CAPTURE);
    doc.addEventListener('touchmove', this.onTouchMove, PASSIVE_CAPTURE);
    doc.addEventListener('touchend', this.onTouchEnd, ACTIVE_CAPTURE);
    doc.addEventListener('touchcancel', this.onTouchCancel, PASSIVE_CAPTURE);
    doc.addEventListener('pointerdown', this.onPointerDown, PASSIVE_CAPTURE);
    doc.addEventListener('pointermove', this.onPointerMove, PASSIVE_CAPTURE);
    doc.addEventListener('pointerup', this.onPointerUp, PASSIVE_CAPTURE);
    doc.addEventListener(
      'pointercancel',
      this.onPointerCancel,
      PASSIVE_CAPTURE,
    );
    doc.addEventListener('pointerout', this.onPointerOut, PASSIVE_CAPTURE);
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
    doc.removeEventListener('pointerout', this.onPointerOut, PASSIVE_CAPTURE);
    doc.removeEventListener('contextmenu', this.onContextMenu, ACTIVE_CAPTURE);
    doc.removeEventListener('scroll', this.onScroll, PASSIVE_CAPTURE);
    doc.removeEventListener('visibilitychange', this.onVisibilityChange);
    view?.removeEventListener('click', this.onClick, ACTIVE_CAPTURE);
    view?.removeEventListener('blur', this.onBlur);
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
    hovers: HoverGestureRecognizer[];
  } {
    const recognizers: GestureRecognizer[] = [];
    const hovers: HoverGestureRecognizer[] = [];
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
        hovers.push(...registration.hovers);
      }
      if (hasConsumerOwner || pointerType == null) {
        continue;
      }
      if (registration?.consumer != null) {
        consumer = registration.consumer;
        hasConsumerOwner = true;
        continue;
      }
    }
    return {recognizers, consumer, hovers};
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
      return;
    }
    const dispositions = this.arena.ended(inputs);
    if (needsSuppression(dispositions)) {
      if (event.cancelable) {
        event.preventDefault();
      }
      this.armSwallower();
    }
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
    this.releaseSelection(id);
    const dispositions = this.arena.ended([
      {id, x: event.clientX, y: event.clientY, time: eventTime(event)},
    ]);
    if (needsSuppression(dispositions)) {
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

  private readonly onScroll = (event: Event): void => {
    const time = eventTime(event);
    const scroller = event.target === this.doc ? this.doc : event.target;
    if (!(scroller instanceof Node)) {
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
      if (touch.target instanceof Node && scroller.contains(touch.target)) {
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
    }
  };

  private readonly onBlur = (): void => {
    this.cancelEverything(this.arena.now());
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
