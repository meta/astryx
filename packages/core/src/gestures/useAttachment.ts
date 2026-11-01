// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useAttachment.ts
 * @input A node ref (an element's, or the document's), an attach function
 *   and a key
 * @output Exports useAttachment, useIsUnmountedRef, and the gesture-sync
 *   depth (syncingGestures, isSyncingGestures) both hooks read
 * @position Internal React helpers shared by useGestureRecognizer,
 *   usePressTracker and useFingerScroll, so each hook imports only what it
 *   uses
 *
 * SYNC: When modified, update useGestureRecognizer.test.tsx and
 * useFingerScroll.test.tsx.
 */

import {useRef, type RefObject} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';

/**
 * How many hooks are driving a recognizer from an Effect right now: an
 * `isEnabled` sync, or the detach of a replaced node that cancels a gesture
 * in flight. While one runs no hook's listener calls its caller's callback
 * (react-component-runtime INV2, INV3): the recognizer it stops is cancelled
 * silently, and what that stop unblocks (a recognizer that required it to
 * fail) resolves in the arena's next pass, a microtask later, where its
 * listener reports as usual (`deferringResolution` in useGestureRecognizer).
 * A press tracker's callbacks wait for a microtask after it (usePressTracker).
 */
let syncingDepth = 0;

/** Runs `body` as a gesture sync (see `syncingDepth`). */
export function syncingGestures<T>(body: () => T): T {
  syncingDepth += 1;
  try {
    return body();
  } finally {
    syncingDepth -= 1;
  }
}

/** True while any gesture hook's sync runs. */
export function isSyncingGestures(): boolean {
  return syncingDepth > 0;
}

/**
 * A flag that turns true when the component unmounts, before the cleanups of
 * the effects declared after it run, so nothing reports from those cleanups.
 */
export function useIsUnmountedRef(): {readonly current: boolean} {
  const isUnmountedRef = useRef(false);
  // Syncs the flag with the component's mount.
  useIsomorphicLayoutEffect(() => {
    isUnmountedRef.current = false;
    return () => {
      isUnmountedRef.current = true;
    };
  }, []);
  return isUnmountedRef;
}

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
