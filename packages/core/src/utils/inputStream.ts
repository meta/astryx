// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file inputStream.ts
 * @input A window, and subscribers to its input events (the press feedback
 *   controller, the gesture host)
 * @output Exports subscribeInput
 * @position The one entry for document-wide input listeners in core: one
 *   native listener per event type on the window's capture phase, shared by
 *   every subscriber
 *
 * The window's capture phase runs before any document listener, so an app's
 * window-capture `stopPropagation`, or a document-capture
 * `stopImmediatePropagation` registered before core subscribed, no longer
 * hides input from the press feedback or the gesture host, as UIKit's
 * recognizers see touches before views do. A recognizer that claims a touch
 * still needs the touch to reach its element: its blocking `touchmove` sits
 * there, below such a stop. And the stream stays ahead of an app's own
 * window-capture listener only until a type's listener is re-added: a
 * passivity switch, or a subscription after the type's last subscriber left,
 * appends it after every window-capture listener registered meanwhile, so an
 * app listener added after core's first subscription runs before core from
 * then on, and its `stopImmediatePropagation` hides the event from every
 * subscriber. Events fired at the document (`visibilitychange`, the
 * page's `scroll`) and every element's `scroll` reach the window's capture
 * phase too. A non-bubbling event fired at an element (`blur`, `focus`)
 * reaches it as well, so a subscriber that means the window's own event
 * checks `event.target`.
 *
 * Subscribers run in subscription order, each isolated: one that throws is
 * reported and the rest still run, as separate native listeners would.
 *
 * A type's native listener is passive, so a page that only paints presses
 * blocks no scroll. It is registered non-passive only while a subscriber
 * that cancels the event (`{cancels: true}`) is subscribed (the gesture
 * host's `touchend`, `click` and `contextmenu` while a claiming participant
 * is attached; the page hold's `touchmove` while it holds), and passive
 * again once that subscriber leaves. With no subscriber left, it is
 * removed.
 *
 * SYNC: When modified, update inputStream.test.ts.
 */

type InputListener = (event: Event) => void;

interface Subscriber {
  readonly listener: InputListener;
  readonly cancels: boolean;
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
}

/** The events a window's capture phase sees: its own, and the document's. */
export type InputEventMap = WindowEventMap & DocumentEventMap;

const streams = new WeakMap<Window, Map<string, Channel>>();

/**
 * Listen to `type` on `view`'s capture phase through its shared native
 * listener. Returns the unsubscribe; calling it again does nothing.
 */
export function subscribeInput<K extends keyof InputEventMap>(
  view: Window,
  type: K,
  listener: (event: InputEventMap[K]) => void,
  {cancels = false}: InputSubscriptionOptions = {},
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
  };
  channel.subscribers.push(subscriber);
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
  const listener: InputListener = event => dispatch(channel, event);
  view.addEventListener(type, listener, {capture: true, passive: !wanted});
  channel.native = {listener, cancels: wanted};
}

function dispatch(channel: Channel, event: Event): void {
  // A subscriber may subscribe or unsubscribe while the event runs; the
  // event goes to those subscribed when it arrived.
  for (const subscriber of [...channel.subscribers]) {
    if (!channel.subscribers.includes(subscriber)) {
      continue;
    }
    try {
      subscriber.listener(event);
    } catch (error) {
      report(error);
    }
  }
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
