// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file fingerScroll.ts
 * @input A scroller (an element, or the document for the page's own scroll),
 *   its document's scroll and scrollend events, and the gesture host's
 *   finger record
 * @output Exports watchFingerScrolls and isFingerScroll
 * @position Finger-scroll watch of packages/core/src/gestures (useFingerScroll
 *   reads it), in its own module so a page that never asks never ships it
 *
 * A watched scroller's scroll is a finger's from a scroll event while a
 * finger that landed inside it is down, until the scroller's own `scrollend`
 * (the momentum after the lift is still the finger's). A scroll that ends
 * while its finger still rests there stays the finger's until the lift. A
 * scroll the program starts while no finger is down there (`scrollTo`, a
 * status-bar tap) is not. No clock is involved. The host keeps the one
 * finger record; this module adds only passive scroll listeners, and only
 * while something is watched.
 */

import type {GestureHost} from './GestureHost';

const PASSIVE_CAPTURE = {capture: true, passive: true} as const;

interface Watch {
  /** Watched scrollers, and how many watchers each has. */
  readonly scrollers: Map<Node, number>;
  /** Watched scrollers whose current scroll is a finger's. */
  readonly fingerScrollers: Set<Node>;
  /** Finger scrolls whose `scrollend` came while the finger still rested. */
  readonly endedWhileDown: Set<Node>;
  stop: (() => void) | null;
}

const watches = new WeakMap<GestureHost, Watch>();

function start(host: GestureHost, watch: Watch): () => void {
  const doc = host.document;
  const scrollerOf = (event: Event): Node | null => {
    const target = event.target === doc ? doc : event.target;
    return target instanceof Node ? target : null;
  };
  const onScroll = (event: Event): void => {
    const scroller = scrollerOf(event);
    if (scroller == null || !watch.scrollers.has(scroller)) {
      return;
    }
    watch.endedWhileDown.delete(scroller);
    if (host.isFingerDownIn(scroller)) {
      watch.fingerScrollers.add(scroller);
    }
  };
  const onScrollEnd = (event: Event): void => {
    const scroller = scrollerOf(event);
    if (scroller == null || !watch.fingerScrollers.has(scroller)) {
      return;
    }
    if (host.isFingerDownIn(scroller)) {
      // The finger still rests there: the scroll is its until the lift.
      watch.endedWhileDown.add(scroller);
    } else {
      watch.fingerScrollers.delete(scroller);
    }
  };
  // A scroll that ended while its finger rested ends with the lift.
  const onFingers = (): void => {
    for (const scroller of watch.endedWhileDown) {
      if (!host.isFingerDownIn(scroller)) {
        watch.endedWhileDown.delete(scroller);
        watch.fingerScrollers.delete(scroller);
      }
    }
  };
  doc.addEventListener('scroll', onScroll, PASSIVE_CAPTURE);
  doc.addEventListener('scrollend', onScrollEnd, PASSIVE_CAPTURE);
  const unsubscribe = host.onFingersChange(onFingers);
  const release = host.retain();
  return () => {
    doc.removeEventListener('scroll', onScroll, PASSIVE_CAPTURE);
    doc.removeEventListener('scrollend', onScrollEnd, PASSIVE_CAPTURE);
    unsubscribe();
    release();
  };
}

/**
 * Keep track of whether the scrolls of `scroller` (an element in `host`'s
 * document, or the document itself) are a finger's, for isFingerScroll,
 * until the returned function runs.
 * Proposed; pending owner review.
 */
export function watchFingerScrolls(
  host: GestureHost,
  scroller: Node,
): () => void {
  let watch = watches.get(host);
  if (watch == null) {
    watch = {
      scrollers: new Map(),
      fingerScrollers: new Set(),
      endedWhileDown: new Set(),
      stop: null,
    };
    watches.set(host, watch);
  }
  const owned = watch;
  owned.scrollers.set(scroller, (owned.scrollers.get(scroller) ?? 0) + 1);
  owned.stop ??= start(host, owned);
  let isWatching = true;
  return () => {
    if (!isWatching) {
      return;
    }
    isWatching = false;
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
 * Proposed; pending owner review.
 */
export function isFingerScroll(host: GestureHost, scroller: Node): boolean {
  return watches.get(host)?.fingerScrollers.has(scroller) === true;
}
