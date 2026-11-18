// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file inputStream.ts
 * @input A window, and subscribers to its input events (the press feedback
 *   controller, the gesture host, the keyboard module)
 * @output subscribeInput. Its readers: getLastPointerType, the latest
 *   pointer's type; getLastMousePoint, the latest mouse point; getDownPresses,
 *   each finger and pen press that is down; getTouches, the fingers on the
 *   screen and how many touches started.
 * @position The one entry for document-wide input listeners in core: one
 *   native listener per event type on the window's capture phase, shared by
 *   every subscriber
 *
 * SYNC: When modified, update inputStream.test.ts.
 */

import {realmValue, sharedKey} from './sharedRealm';

// The window's capture phase runs before document listeners, so an app's
// `stopPropagation` there does not hide input from press feedback or the
// gesture host. A claiming recognizer still needs the touch to reach its
// element. A passivity switch or a new first subscriber adds a type's
// listener again. App window-capture listeners added meanwhile then run
// before it. Document events and element
// `scroll` reach the window's capture phase too, and so does an element's
// `blur` or `focus`. A subscriber for the window's own event checks
// `event.target`.
//
// Subscribers run in subscription order, after the ones subscribed `first`.
// A first subscriber that returns `true` ends the dispatch: no later
// subscriber hears the event. One that throws is reported, and the rest still
// run.
//
// A type's native listener is passive, so it blocks no scroll. It is
// non-passive only while a subscriber that cancels the event
// (`{cancels: true}`) is subscribed. With no subscriber left, it is removed.

type InputListener = (event: Event) => unknown;

interface Subscriber {
  readonly listener: InputListener;
  readonly cancels: boolean;
  readonly isFirst: boolean;
}

interface Channel {
  readonly subscribers: Subscriber[];
  /** The registered native listener and whether it may cancel. */
  native: {readonly listener: InputListener; readonly cancels: boolean} | null;
}

/** Options for {@link subscribeInput}. */
export interface InputSubscriptionOptions {
  /**
   * The subscriber calls `preventDefault()` on this event type, so the
   * native listener must not be passive while it is subscribed.
   * @default false
   */
  readonly cancels?: boolean;
  /**
   * The subscriber runs before every subscriber that is not first. When it
   * returns `true`, no later subscriber hears the event.
   * @default false
   */
  readonly first?: boolean;
}

/** The events a window's capture phase sees: its own, and the document's. */
export type InputEventMap = WindowEventMap & DocumentEventMap;

/**
 * Registered, so a swizzled copy's subscribers join the package's window
 * listeners.
 */
const inputState = realmValue(sharedKey('input-stream', 1), () => ({
  streams: new WeakMap<Window, Map<string, Channel>>(),
  /** The type of the latest pointer event each window's stream delivered. */
  lastPointerTypes: new WeakMap<Window, string>(),
  /** Where the latest mouse pointer event each window's stream delivered was. */
  lastMousePoints: new WeakMap<Window, MousePoint>(),
  /** Each window's finger and pen presses that are down, by pointer id. */
  downPresses: new WeakMap<Window, Map<number, MousePoint>>(),
}));
const {streams, lastPointerTypes, lastMousePoints, downPresses} = inputState;
const NO_PRESSES: ReadonlyMap<number, MousePoint> = new Map();

/** The fingers on a window's screen, and the touches that started there. */
export interface TouchRecord {
  /** How many fingers are on the screen. */
  readonly fingers: number;
  /**
   * How many touches started. It never goes down, so a count a caller notes
   * stays comparable: a different count later says a touch started since.
   */
  readonly starts: number;
}

const NO_TOUCHES: TouchRecord = {fingers: 0, starts: 0};

/**
 * How many fingers are on each window's screen, and how many touches have
 * started, from its touch events. Its own key keeps the stream's first state
 * readable by copies built before it.
 */
const touchRecords = realmValue(
  sharedKey('input-stream/touches', 1),
  () => new WeakMap<Window, TouchRecord>(),
);

/** A point in the viewport, in CSS pixels. */
export interface MousePoint {
  readonly x: number;
  readonly y: number;
}

/**
 * The type of the latest pointer event `view`'s stream delivered: `mouse`,
 * `pen` or `touch`, or `null` before any. The stream hears a pointer event
 * type only while a subscriber listens to it, as press feedback does on any
 * page with a pressable. Reading it adds no listener.
 */
export function getLastPointerType(view: Window): string | null {
  return lastPointerTypes.get(view) ?? null;
}

/**
 * Where the latest mouse pointer event `view`'s stream delivered was, in
 * viewport coordinates, or `null` before any. A mouse that has not moved
 * since rests there. Reading it adds no listener.
 */
export function getLastMousePoint(view: Window): MousePoint | null {
  return lastMousePoints.get(view) ?? null;
}

/**
 * The finger and pen presses that are down in `view`, by pointer id, each at
 * the point where the stream last heard it. The stream hears them only while
 * subscribers listen to `pointerdown`, `pointerup` and `pointercancel` (and
 * `pointermove` for a moving press), as press feedback and the gesture host
 * do. Reading it adds no listener.
 */
export function getDownPresses(view: Window): ReadonlyMap<number, MousePoint> {
  return downPresses.get(view) ?? NO_PRESSES;
}

/**
 * The fingers on `view`'s screen and the touches that started there, from the
 * touch events its stream delivered. A native pan keeps the finger on the
 * screen, though the pan's `pointercancel` drops its press from
 * getDownPresses. The stream counts only while subscribers listen to
 * `touchstart`, `touchend` and `touchcancel`, as the keyboard module does.
 * Reading it adds no listener. It counts a stylus too, since a stylus drag
 * moves the page as a finger does. The gesture host's own count skips a
 * stylus, and it listens only while a recognizer needs input, so it cannot
 * serve here.
 *
 * @example
 * ```
 * const isFingerDown = getTouches(window).fingers > 0;
 * ```
 */
export function getTouches(view: Window): TouchRecord {
  return touchRecords.get(view) ?? NO_TOUCHES;
}

/**
 * Listen to `type` on `view`'s capture phase through its shared native
 * listener. Returns the unsubscribe; calling it again does nothing.
 */
export function subscribeInput<K extends keyof InputEventMap>(
  view: Window,
  type: K,
  listener: (event: InputEventMap[K]) => unknown,
  {cancels = false, first = false}: InputSubscriptionOptions = {},
): () => void {
  let channels = streams.get(view);
  if (channels == null) {
    channels = new Map();
    streams.set(view, channels);
  }
  let channel = channels.get(type);
  if (channel == null) {
    channel = {subscribers: [], native: null};
    channels.set(type, channel);
  }
  const subscriber: Subscriber = {
    listener: listener as InputListener,
    cancels,
    isFirst: first,
  };
  const firstLater = first
    ? channel.subscribers.findIndex(other => !other.isFirst)
    : -1;
  if (firstLater === -1) {
    channel.subscribers.push(subscriber);
  } else {
    channel.subscribers.splice(firstLater, 0, subscriber);
  }
  register(view, type, channel);
  let isSubscribed = true;
  return () => {
    if (!isSubscribed) {
      return;
    }
    isSubscribed = false;
    const current = streams.get(view)?.get(type);
    if (current == null) {
      return;
    }
    const index = current.subscribers.indexOf(subscriber);
    if (index !== -1) {
      current.subscribers.splice(index, 1);
    }
    register(view, type, current);
    if (current.subscribers.length === 0) {
      streams.get(view)?.delete(type);
      // Without a listener the stream cannot hear a press end, so the
      // presses it recorded may already have ended.
      if (type === 'pointerup' || type === 'pointercancel') {
        downPresses.delete(view);
      }
      if (type === 'touchend' || type === 'touchcancel') {
        forgetFingers(view);
      }
    }
  };
}

/**
 * Bring the channel's native listener in line with its subscribers: none
 * without subscribers, non-passive while one of them cancels.
 */
function register(view: Window, type: string, channel: Channel): void {
  const wanted =
    channel.subscribers.length === 0
      ? null
      : channel.subscribers.some(subscriber => subscriber.cancels);
  const native = channel.native;
  if (native != null && native.cancels === wanted) {
    return;
  }
  if (native != null) {
    view.removeEventListener(type, native.listener, {capture: true});
    channel.native = null;
  }
  if (wanted == null) {
    return;
  }
  const listener: InputListener = event => dispatch(view, channel, event);
  view.addEventListener(type, listener, {capture: true, passive: !wanted});
  channel.native = {listener, cancels: wanted};
}

function dispatch(view: Window, channel: Channel, event: Event): void {
  // Recorded before any subscriber runs, so each reads the pointer at hand.
  const {pointerType, clientX, clientY} = event as Partial<PointerEvent>;
  if (typeof pointerType === 'string' && pointerType !== '') {
    lastPointerTypes.set(view, pointerType);
  }
  if (
    pointerType === 'mouse' &&
    typeof clientX === 'number' &&
    typeof clientY === 'number'
  ) {
    lastMousePoints.set(view, {x: clientX, y: clientY});
  }
  if (pointerType === 'touch' || pointerType === 'pen') {
    recordPress(view, event);
  }
  if (
    event.type === 'touchstart' ||
    event.type === 'touchend' ||
    event.type === 'touchcancel'
  ) {
    recordTouches(view, event);
  }
  // A subscriber may subscribe or unsubscribe while the event runs; the
  // event goes to those subscribed when it arrived.
  for (const subscriber of [...channel.subscribers]) {
    if (!channel.subscribers.includes(subscriber)) {
      continue;
    }
    try {
      if (subscriber.listener(event) === true && subscriber.isFirst) {
        return;
      }
    } catch (error) {
      report(error);
    }
  }
}

// The count stays only while both ends are heard: a missed `touchend` would
// otherwise leave a finger on the screen.
function recordTouches(view: Window, event: Event): void {
  const channels = streams.get(view);
  if (channels?.has('touchend') !== true || !channels.has('touchcancel')) {
    forgetFingers(view);
    return;
  }
  const {touches} = event as Partial<TouchEvent>;
  const starts = touchRecords.get(view)?.starts ?? 0;
  touchRecords.set(view, {
    fingers: touches?.length ?? 0,
    starts: event.type === 'touchstart' ? starts + 1 : starts,
  });
}

function forgetFingers(view: Window): void {
  const record = touchRecords.get(view);
  if (record != null) {
    touchRecords.set(view, {fingers: 0, starts: record.starts});
  }
}

function recordPress(view: Window, event: Event): void {
  const {pointerId, clientX, clientY} = event as Partial<PointerEvent>;
  if (typeof pointerId !== 'number') {
    return;
  }
  let presses = downPresses.get(view);
  if (event.type === 'pointerup' || event.type === 'pointercancel') {
    presses?.delete(pointerId);
    return;
  }
  if (
    (event.type !== 'pointerdown' &&
      !(event.type === 'pointermove' && presses?.has(pointerId) === true)) ||
    typeof clientX !== 'number' ||
    typeof clientY !== 'number'
  ) {
    return;
  }
  if (presses == null) {
    presses = new Map();
    downPresses.set(view, presses);
  }
  presses.set(pointerId, {x: clientX, y: clientY});
}

function report(error: unknown): void {
  if (typeof globalThis.reportError === 'function') {
    globalThis.reportError(error);
    return;
  }
  queueMicrotask(() => {
    throw error;
  });
}
