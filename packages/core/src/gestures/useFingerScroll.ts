// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useFingerScroll.ts
 * @input A scroller (a ref to an element, or the document for the page) and
 *   the document's gesture host
 * @output useFingerScroll: whether the scroller's scroll is a finger's, read
 *   now or at a past time, and an optional call when one ends
 * @position Gesture hook of packages/core/src/gestures, over the
 *   finger-scroll watch (fingerScroll.ts), kept on the scroller's node by
 *   the gesture hooks' shared attachment (hooks/useAttachment.ts). An internal
 *   piece of the touch
 *   module with no public API, not in the gestures barrel: a scroll-driven
 *   component (a tab bar that minimizes, a header that collapses, a picker
 *   that commits at rest) imports it from here, so it ships only where used
 *
 * A scroll is a finger's from a scroll event while a finger that landed
 * inside the scroller is down, until the scroller's `scrollend` (the lift
 * starts the momentum, which is still the finger's), or, where the browser
 * sends no `scrollend`, until a 150 ms fallback after the last scroll event.
 * A scroll with no finger down, or a recognizer's own scroll, is the
 * program's, even right after a tap. A
 * component that reacts to the person's scrolling only (a tab bar that
 * minimizes as the page scrolls down) reads this instead of listening to
 * touches itself.
 *
 * SYNC: When modified, update __tests__/useFingerScroll.test.tsx.
 */

import {useCallback, useRef, type RefObject} from 'react';
import {isFingerScroll, watchFingerScrolls} from './fingerScroll';
import {getGestureHost} from './GestureHost';
import {useAttachment} from '../hooks/useAttachment';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {isDocument} from '../utils/nodeType';

/** The document a scroller is in: itself, for the page's own scroll. */
function documentOf(node: Element | Document): Document {
  return isDocument(node) ? node : node.ownerDocument;
}

export interface UseFingerScrollOptions {
  /**
   * Runs each time a finger's scroll on the scroller ends, once the reader
   * says `false`: at its `scrollend` after the lift (the momentum is still
   * the finger's), at the lift when the scroll ended under a resting finger,
   * after the quiet fallback where the browser fires no `scrollend`, or when
   * the primary pointer stops being coarse. Unmounting, or the scroller
   * changing, does not call it. The latest function is the one called.
   */
  onEnd?: () => void;
}

/**
 * Watch a scroller's finger scrolls. Pass a ref to a scrolling element, or
 * the document for the page's own scroll. Returns a reader, stable across
 * renders: `true` while the scroller's scroll is a finger's. Given a time on
 * the page's clock (`performance.now()`, as an IntersectionObserver entry's
 * `time` is), it reads whether the scroll at that time was a finger's.
 * Internal: not exported from the package.
 */
export function useFingerScroll(
  scroller: RefObject<Element | null> | Document,
  {onEnd}: UseFingerScrollOptions = {},
): (at?: number) => boolean {
  /** The node the watch is on now, for the reader. */
  const watchedRef = useRef<Element | Document | null>(null);
  // The watch outlives renders, so it calls the latest onEnd through a ref
  // written at commit.
  const onEndRef = useRef(onEnd);
  useIsomorphicLayoutEffect(function keepLatestOnEnd() {
    onEndRef.current = onEnd;
  });
  // Keeps the finger-scroll watch on the node the scroller names after each
  // commit (useAttachment): a ref that now points at another element moves
  // the watch to it, and unmounting releases it.
  useAttachment<Element | Document>(
    isDocument(scroller) ? {current: scroller} : scroller,
    node => {
      watchedRef.current = node;
      const stop = watchFingerScrolls(
        getGestureHost(documentOf(node)),
        node,
        () => onEndRef.current?.(),
      );
      return () => {
        stop();
        watchedRef.current = null;
      };
    },
    null,
  );
  return useCallback((at?: number) => {
    const node = watchedRef.current;
    return (
      node != null && isFingerScroll(getGestureHost(documentOf(node)), node, at)
    );
  }, []);
}
