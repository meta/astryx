// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useAttachment.ts
 * @input A node ref (an element's, or the document's), an attach function
 *   and a key
 * @output Exports useAttachment: keeps the attach function bound to the node
 *   the ref holds across commits
 * @position Internal React helper, not in hooks/index.ts: the one attach
 *   and release lifecycle of the gesture hooks (useGestureRecognizer,
 *   usePressTracker, useFingerScroll)
 *
 * SYNC: When modified, update gestures/__tests__/useGestureRecognizer.test.tsx
 * and gestures/__tests__/useFingerScroll.test.tsx.
 */

import {useRef, type RefObject} from 'react';
import {useIsomorphicLayoutEffect} from './useIsomorphicLayoutEffect';

/**
 * Keep `attach` bound to the node `ref` holds after each commit: an element,
 * or the document. A replaced node is released and the new one attached, a
 * changed `key` re-attaches, and the last attachment is released on unmount;
 * a commit that changes neither does nothing (react-component-runtime INV3).
 */
export function useAttachment<T extends Node = Element>(
  ref: RefObject<T | null>,
  attach: (element: T) => () => void,
  key: unknown,
): void {
  const attachmentRef = useRef<{
    element: T;
    key: unknown;
    release: () => void;
  } | null>(null);

  // Syncs the attachment with the DOM node `ref` holds after this commit.
  useIsomorphicLayoutEffect(() => {
    const element = ref.current;
    const current = attachmentRef.current;
    if (current?.element === element && current?.key === key) {
      return;
    }
    current?.release();
    attachmentRef.current =
      element == null ? null : {element, key, release: attach(element)};
  });

  // Releases the attachment at unmount.
  useIsomorphicLayoutEffect(
    () => () => {
      attachmentRef.current?.release();
      attachmentRef.current = null;
    },
    [],
  );
}
