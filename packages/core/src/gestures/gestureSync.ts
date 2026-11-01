// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file gestureSync.ts
 * @input Nothing: module state and a React ref
 * @output Exports useIsUnmountedRef, and the gesture-sync depth
 *   (syncingGestures, isSyncingGestures) the gesture hooks read
 * @position Internal helpers shared by useGestureRecognizer and
 *   usePressTracker, so each hook imports only what it uses
 *
 * SYNC: When modified, update __tests__/useGestureRecognizer.test.tsx.
 */

import {useRef} from 'react';
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
