// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useAttachment.ts
 * @input An element ref, an attach function and a key
 * @output Exports useAttachment and useIsUnmountedRef
 * @position Internal React helpers shared by useGestureRecognizer and
 *   usePressTracker, so each hook imports only what it uses
 *
 * SYNC: When modified, update useGestureRecognizer.test.tsx.
 */

import {useRef, type RefObject} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';

/**
 * A flag that turns true when the component unmounts, before the cleanups of
 * the effects declared after it run, so nothing reports from those cleanups.
 */
export function useIsUnmountedRef(): {readonly current: boolean} {
  const isUnmountedRef = useRef(false);
  useIsomorphicLayoutEffect(() => {
    isUnmountedRef.current = false;
    return () => {
      isUnmountedRef.current = true;
    };
  }, []);
  return isUnmountedRef;
}

/**
 * Keep `attach` bound to the element `ref` holds after each commit. A
 * replaced node is released and the new one attached, a changed `key`
 * re-attaches, and the last attachment is released on unmount; a commit that
 * changes neither does nothing (react-component-runtime INV3).
 */
export function useAttachment(
  ref: RefObject<Element | null>,
  attach: (element: Element) => () => void,
  key: unknown,
): void {
  const attachmentRef = useRef<{
    element: Element;
    key: unknown;
    release: () => void;
  } | null>(null);

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

  useIsomorphicLayoutEffect(
    () => () => {
      attachmentRef.current?.release();
      attachmentRef.current = null;
    },
    [],
  );
}
