// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useFingerScroll.ts
 * @input A scroller (a ref to an element, or the document for the page) and
 *   the document's gesture host
 * @output useFingerScroll: whether the scroller's current scroll is a
 *   finger's, read at any moment
 * @position Gesture hook of packages/core/src/gestures, over the host's
 *   finger-scroll watch
 *
 * A scroll is a finger's from a scroll event while a finger that landed
 * inside the scroller is down, until the scroller's `scrollend` (the lift
 * starts the momentum, which is still the finger's). A scroll with no
 * finger down is the program's, even right after a tap. No timers. A
 * component that reacts to the person's scrolling only (a tab bar that
 * minimizes as the page scrolls down) reads this instead of listening to
 * touches itself.
 *
 * SYNC: When modified, update useFingerScroll.doc.mjs and
 * __tests__/useFingerScroll.test.tsx.
 */

import {useCallback, useRef, type RefObject} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {getGestureHost} from './GestureHost';

function isDocument(value: unknown): value is Document {
  return typeof Document !== 'undefined' && value instanceof Document;
}

/**
 * Watch a scroller's finger scrolls. Pass a ref to a scrolling element, or
 * the document for the page's own scroll. Returns a reader, stable across
 * renders: `true` while the scroller's scroll is a finger's.
 * Proposed; pending owner review.
 * @experimental
 */
export function useFingerScroll(
  scroller: RefObject<Element | null> | Document,
): () => boolean {
  const attachedRef = useRef<{node: Node; detach: () => void} | null>(null);
  // Follows the node on every commit: a ref that now points at another
  // element moves the watch to it.
  useIsomorphicLayoutEffect(() => {
    const node = isDocument(scroller) ? scroller : scroller.current;
    if (attachedRef.current?.node === node) {
      return;
    }
    attachedRef.current?.detach();
    attachedRef.current =
      node == null
        ? null
        : {
            node,
            detach: getGestureHost(
              isDocument(node) ? node : node.ownerDocument,
            ).watchFingerScrolls(node),
          };
  });
  useIsomorphicLayoutEffect(
    () => () => {
      attachedRef.current?.detach();
      attachedRef.current = null;
    },
    [],
  );
  return useCallback(() => {
    const node = attachedRef.current?.node;
    if (node == null) {
      return false;
    }
    const doc = isDocument(node) ? node : node.ownerDocument;
    return doc != null && getGestureHost(doc).isFingerScroll(node);
  }, []);
}
