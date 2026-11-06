// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file fingerScroll.ts
 * @input A scroller (an element, or the document for the page's own scroll),
 *   its document's scroll and scrollend events, and the gesture host's
 *   finger record
 * @output Exports watchFingerScrolls and isFingerScroll; a watcher can ask to
 *   be told when a finger's scroll ends
 * @position Finger-scroll watch of packages/core/src/gestures (useFingerScroll
 *   reads it), in its own module so a page that never asks never ships it;
 *   internal to the touch module, not in the gestures barrel
 *
 * A watched scroller's scroll is a finger's from a scroll event while a
 * finger that landed inside it is down, until the scroller's own `scrollend`
 * (the momentum after the lift is still the finger's). A scroll that ends
 * while its finger still rests there stays the finger's until the lift. A
 * scroll the program starts while no finger is down there (`scrollTo`, a
 * status-bar tap) is not. Where the browser sends no `scrollend`, a quiet
 * spell of `SCROLL_END_FALLBACK_MS` after its last scroll event ends a
 * finger's scroll instead. The host keeps the one finger record; this module
 * adds only passive scroll listeners, and only while something is watched.
 */

import {subscribeInput} from '../utils/inputStream';
import {isCoarsePointer, watchCoarsePointer} from '../utils/coarsePointer';
import type {GestureHost} from './GestureHost';
import {isNode} from '../utils/nodeType';

/**
 * Where the browser sends no `scrollend`, how long a finger-driven scroller
 * stays quiet (no scroll event) before its scroll counts as ended, in ms:
 * longer than the gap between a momentum scroll's events, short enough that
 * a program's scroll right after it is not read as the finger's.
 */
const SCROLL_END_FALLBACK_MS = 150;

interface Watch {
  /** Watched scrollers, and how many watchers each has. */
  readonly scrollers: Map<Node, number>;
  /** Watched scrollers whose current scroll is a finger's. */
  readonly fingerScrollers: Set<Node>;
  /** Finger scrolls whose `scrollend` came while the finger still rested. */
  readonly endedWhileDown: Set<Node>;
  /** Per scroller, the watchers to tell when its finger scroll ends. */
  readonly endListeners: Map<Node, Set<() => void>>;
  stop: (() => void) | null;
}

const watches = new WeakMap<GestureHost, Watch>();

/**
 * A scroller's finger scroll is over: it stops counting as the finger's, and
 * then its end listeners hear of it, so a listener that reads
 * isFingerScroll already reads false.
 */
function endFingerScroll(watch: Watch, scroller: Node): void {
  if (!watch.fingerScrollers.delete(scroller)) {
    return;
  }
  for (const listener of [...(watch.endListeners.get(scroller) ?? [])]) {
    listener();
  }
}

function start(host: GestureHost, watch: Watch): () => void {
  const doc = host.document;
  const scrollerOf = (event: Event): Node | null => {
    const target = event.target === doc ? doc : event.target;
    return isNode(target) ? target : null;
  };
  // A finger's scroll ends at the scroller's scrollend, or, where the
  // browser sends none, after a quiet spell.
  const endScroll = (scroller: Node): void => {
    if (!watch.fingerScrollers.has(scroller)) {
      return;
    }
    if (host.isFingerDownIn(scroller)) {
      // The finger still rests there: the scroll is its until the lift.
      watch.endedWhileDown.add(scroller);
    } else {
      endFingerScroll(watch, scroller);
    }
  };
  const scrollEndFallbacks = new Map<Node, ReturnType<typeof setTimeout>>();
  const clearScrollEndFallback = (scroller: Node): void => {
    const timer = scrollEndFallbacks.get(scroller);
    if (timer != null) {
      clearTimeout(timer);
      scrollEndFallbacks.delete(scroller);
    }
  };
  const hasScrollEnd = (): boolean => {
    const view = doc.defaultView;
    return view != null && 'onscrollend' in view;
  };
  const onScroll = (event: Event): void => {
    const scroller = scrollerOf(event);
    // A recognizer's own scroll (a menu's edge autoscroll) is never the
    // finger's, even with a finger resting inside.
    if (
      scroller == null ||
      !watch.scrollers.has(scroller) ||
      host.isOwnScroll(scroller)
    ) {
      return;
    }
    watch.endedWhileDown.delete(scroller);
    if (host.isFingerDownIn(scroller)) {
      watch.fingerScrollers.add(scroller);
    }
    if (watch.fingerScrollers.has(scroller) && !hasScrollEnd()) {
      clearScrollEndFallback(scroller);
      scrollEndFallbacks.set(
        scroller,
        setTimeout(() => {
          scrollEndFallbacks.delete(scroller);
          endScroll(scroller);
        }, SCROLL_END_FALLBACK_MS),
      );
    }
  };
  const onScrollEnd = (event: Event): void => {
    const scroller = scrollerOf(event);
    if (scroller != null) {
      endScroll(scroller);
    }
  };
  // A scroll that ended while its finger rested ends with the lift.
  const onFingers = (): void => {
    for (const scroller of watch.endedWhileDown) {
      if (!host.isFingerDownIn(scroller)) {
        watch.endedWhileDown.delete(scroller);
        endFingerScroll(watch, scroller);
      }
    }
  };
  // Its listeners are on only while the primary pointer is coarse
  // (`spec:AST-094` FR19, FR24): elsewhere no finger scrolls, as far as the
  // touch presentation is concerned. Passive, on the window's capture phase
  // through the shared input stream.
  const view = doc.defaultView;
  let unsubscribers: (() => void)[] = [];
  const listen = (on: boolean): void => {
    if (view == null || on === unsubscribers.length > 0) {
      return;
    }
    if (on) {
      unsubscribers = [
        subscribeInput(view, 'scroll', onScroll),
        subscribeInput(view, 'scrollend', onScrollEnd),
      ];
    } else {
      for (const stop of unsubscribers.splice(0)) {
        stop();
      }
      for (const scroller of [...scrollEndFallbacks.keys()]) {
        clearScrollEndFallback(scroller);
      }
      // No finger scrolls once the pointer is no longer coarse: each one in
      // progress ends here.
      watch.endedWhileDown.clear();
      for (const scroller of [...watch.fingerScrollers]) {
        endFingerScroll(watch, scroller);
      }
    }
  };
  const stopWatchingPointer = watchCoarsePointer(view, listen);
  listen(isCoarsePointer(view));
  const unsubscribe = host.onFingersChange(onFingers);
  const release = host.retain();
  return () => {
    stopWatchingPointer();
    listen(false);
    unsubscribe();
    release();
  };
}

/**
 * Keep track of whether the scrolls of `scroller` (an element in `host`'s
 * document, or the document itself) are a finger's, for isFingerScroll,
 * until the returned function runs. `onEnd`, when given, runs each time a
 * finger's scroll on the scroller ends (its `scrollend` after the lift, the
 * lift after a `scrollend` that came while the finger rested, the quiet
 * fallback, or the pointer turning fine), after isFingerScroll turns false.
 * Stopping the watch does not call it.
 * Internal: not exported from the package.
 */
export function watchFingerScrolls(
  host: GestureHost,
  scroller: Node,
  onEnd?: () => void,
): () => void {
  let watch = watches.get(host);
  if (watch == null) {
    watch = {
      scrollers: new Map(),
      fingerScrollers: new Set(),
      endedWhileDown: new Set(),
      endListeners: new Map(),
      stop: null,
    };
    watches.set(host, watch);
  }
  const owned = watch;
  owned.scrollers.set(scroller, (owned.scrollers.get(scroller) ?? 0) + 1);
  // Each watch registers its own listener, so two watchers of one scroller
  // each hear every end once.
  const listener = onEnd == null ? null : () => onEnd();
  if (listener != null) {
    const listeners = owned.endListeners.get(scroller) ?? new Set();
    listeners.add(listener);
    owned.endListeners.set(scroller, listeners);
  }
  owned.stop ??= start(host, owned);
  let isWatching = true;
  return () => {
    if (!isWatching) {
      return;
    }
    isWatching = false;
    if (listener != null) {
      const listeners = owned.endListeners.get(scroller);
      listeners?.delete(listener);
      if (listeners?.size === 0) {
        owned.endListeners.delete(scroller);
      }
    }
    const count = (owned.scrollers.get(scroller) ?? 1) - 1;
    if (count > 0) {
      owned.scrollers.set(scroller, count);
      return;
    }
    owned.scrollers.delete(scroller);
    owned.fingerScrollers.delete(scroller);
    owned.endedWhileDown.delete(scroller);
    if (owned.scrollers.size === 0) {
      owned.stop?.();
      owned.stop = null;
    }
  };
}

/**
 * Whether the scroll now moving a watched `scroller` is a finger's.
 * Internal: not exported from the package.
 */
export function isFingerScroll(host: GestureHost, scroller: Node): boolean {
  return watches.get(host)?.fingerScrollers.has(scroller) === true;
}
