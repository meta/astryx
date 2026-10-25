// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pageHold.ts
 * @input A document, its gesture host if it has one (which touches a
 *   recognizer owns), and a scroll lock's decision
 * @output Exports holdPageScroll and PageScrollDecision
 * @position Scroll-lock support of packages/core/src/gestures, in its own
 *   module so a page without a scroll lock never ships it. It imports nothing
 *   of the gesture host: it asks the document's host only if one exists, so a
 *   scroll lock does not bring the host, its arena and its recognizers into
 *   every overlay.
 *
 * While a hold is held, a one-finger pan that `decide` says would scroll the
 * page, and that no recognizer owns, is cancelled for the rest of its touch;
 * a second finger (pinch-zoom) never is. A document with no gesture host has
 * no recognizer, so no touch there is owned. Holds stack per document. Only
 * while one is held is there a non-passive `touchmove` listener, so a scroll
 * lock costs nothing once it is released, and a touch scrolls as without
 * the system.
 *
 * SYNC: When modified, update the gestures README ("Holding the page still").
 */

import {subscribeInput} from '../utils/inputStream';
import {isCoarsePointer, watchCoarsePointer} from '../utils/coarsePointer';
import {gestureHosts} from './hostRegistry';

/**
 * Decides, once per one-finger touch, whether its pan would scroll the page:
 * `origin` is the innermost node under the finger (the composed path's first
 * node, so a scroller inside a shadow root is seen), `dx` and `dy` the touch's
 * movement once it clears a small slop. True cancels the touch's moves for as
 * long as it lasts.
 */
export type PageScrollDecision = (
  origin: EventTarget | null,
  dx: number,
  dy: number,
) => boolean;

/**
 * How far a finger travels before a page-scroll hold judges its pan, in CSS
 * px: enough that a swipe's first sample (a 2 px by 2 px wobble) does not fix
 * the wrong axis, and still under WebKit's 10–11 px scroll claim, so the
 * verdict comes before the browser commits to a scroll.
 */
const PAGE_HOLD_SLOP = 5;

interface PageHolds {
  readonly decisions: Set<{readonly decide: PageScrollDecision}>;
  /** The one finger of the gesture the holds are judging. */
  touch: {
    readonly id: number;
    readonly x: number;
    readonly y: number;
    verdict: boolean | null;
  } | null;
  readonly onTouchStart: (event: TouchEvent) => void;
  readonly onTouchMove: (event: TouchEvent) => void;
  /** The input stream subscriptions while held and the pointer is coarse. */
  unsubscribers: Array<() => void>;
  stopWatchingPointer: (() => void) | null;
}

const holdsByDocument = new WeakMap<Document, PageHolds>();

function fingersOf(event: TouchEvent): Touch[] {
  return event.touches == null ? [] : Array.from(event.touches);
}

function createHolds(doc: Document): PageHolds {
  const holds: PageHolds = {
    decisions: new Set(),
    touch: null,
    unsubscribers: [],
    stopWatchingPointer: null,
    onTouchStart: event => {
      const fingers = fingersOf(event);
      const finger = fingers[0];
      holds.touch =
        fingers.length === 1 && finger != null
          ? {
              id: finger.identifier,
              x: finger.clientX,
              y: finger.clientY,
              verdict: null,
            }
          : null;
    },
    onTouchMove: event => {
      const current = holds.touch;
      const fingers = fingersOf(event);
      const finger = fingers[0];
      // A second finger is a pinch: zooming the page stays available.
      if (
        fingers.length !== 1 ||
        finger == null ||
        current == null ||
        finger.identifier !== current.id
      ) {
        return;
      }
      // A recognizer that owns the touch decides about its moves itself. The
      // host is read on every move: one may be created after the hold began.
      if (gestureHosts.get(doc)?.isTouchClaimed(current.id) === true) {
        return;
      }
      if (current.verdict == null) {
        const dx = finger.clientX - current.x;
        const dy = finger.clientY - current.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < PAGE_HOLD_SLOP) {
          return;
        }
        // The browser picks the scroller once per gesture; so do the holds.
        const origin = event.composedPath()[0] ?? event.target;
        current.verdict = [...holds.decisions].some(hold =>
          hold.decide(origin, dx, dy),
        );
      }
      if (current.verdict && event.cancelable) {
        event.preventDefault();
      }
    },
  };
  return holds;
}

/**
 * Turn the holds' listeners on or off: on only while one is held and the
 * primary pointer is coarse (`spec:AST-094` FR19, FR24).
 */
function listen(doc: Document, holds: PageHolds, on: boolean): void {
  const view = doc.defaultView;
  if (view == null || on === holds.unsubscribers.length > 0) {
    return;
  }
  if (on) {
    // The window's capture phase, through the shared input stream, as the
    // host listens; only the touchmove that cancels is non-passive.
    holds.unsubscribers = [
      subscribeInput(view, 'touchstart', holds.onTouchStart),
      subscribeInput(view, 'touchmove', holds.onTouchMove, {cancels: true}),
    ];
  } else {
    for (const unsubscribe of holds.unsubscribers.splice(0)) {
      unsubscribe();
    }
    holds.touch = null;
  }
}

/**
 * Hold the page of `doc` still under a finger until the returned release runs
 * (a scroll lock under a modal presentation): `holdPageScroll(document,
 * decide)`. Never creates a gesture host. Where the primary pointer is fine
 * it registers nothing, following the pointer while held.
 * Proposed; pending owner review.
 */
export function holdPageScroll(
  doc: Document,
  decide: PageScrollDecision,
): () => void {
  let holds = holdsByDocument.get(doc);
  if (holds == null) {
    holds = createHolds(doc);
    holdsByDocument.set(doc, holds);
  }
  const owned = holds;
  const hold = {decide};
  owned.decisions.add(hold);
  if (owned.decisions.size === 1) {
    const view = doc.defaultView;
    owned.stopWatchingPointer = watchCoarsePointer(view, isCoarse =>
      listen(doc, owned, isCoarse),
    );
    listen(doc, owned, isCoarsePointer(view));
  }
  let isHeld = true;
  return () => {
    if (!isHeld) {
      return;
    }
    isHeld = false;
    owned.decisions.delete(hold);
    if (owned.decisions.size === 0) {
      owned.stopWatchingPointer?.();
      owned.stopWatchingPointer = null;
      listen(doc, owned, false);
    }
  };
}
