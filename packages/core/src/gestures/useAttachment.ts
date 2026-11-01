// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useAttachment.ts
 * @input An element ref, an attach function and a key
 * @output Exports useAttachment, useAttachmentPair (the same for two nodes),
 *   useIsUnmountedRef, and the gesture-sync depth (syncingGestures,
 *   isSyncingGestures) both hooks read
 * @position Internal React helpers shared by useGestureRecognizer,
 *   usePressTracker and usePager, so each hook imports only what it uses
 *
 * SYNC: When modified, update useGestureRecognizer.test.tsx and
 * __tests__/useAttachmentPair.test.tsx.
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
  useAttachedNodes([ref], ([element]) => attach(element), key);
}

/**
 * `useAttachment` for two nodes: keep `attach` bound to the pair the refs hold
 * after each commit, once both are there. Replacing either node releases the
 * attachment and attaches the new pair, a changed `key` re-attaches, and the
 * last attachment is released on unmount; a commit that changes neither does
 * nothing (react-component-runtime INV3).
 */
export function useAttachmentPair<A extends Element, B extends Element>(
  firstRef: RefObject<A | null>,
  secondRef: RefObject<B | null>,
  attach: (first: A, second: B) => () => void,
  key: unknown,
): void {
  useAttachedNodes(
    [firstRef, secondRef],
    ([first, second]) => attach(first as A, second as B),
    key,
  );
}

/**
 * The lifecycle both share: one attachment of the nodes the refs hold, made
 * once every one is there, released when a node or `key` changes, and at
 * unmount.
 */
function useAttachedNodes(
  refs: ReadonlyArray<RefObject<Element | null>>,
  attach: (nodes: ReadonlyArray<Element>) => () => void,
  key: unknown,
): void {
  const attachmentRef = useRef<{
    nodes: ReadonlyArray<Element>;
    key: unknown;
    release: () => void;
  } | null>(null);

  // Syncs the attachment with the DOM nodes the refs hold after this commit.
  useIsomorphicLayoutEffect(() => {
    const nodes = refs.map(ref => ref.current);
    const current = attachmentRef.current;
    if (
      current != null &&
      current.key === key &&
      nodes.every((node, index) => node === current.nodes[index])
    ) {
      return;
    }
    current?.release();
    attachmentRef.current = nodes.every(node => node != null)
      ? {nodes, key, release: attach(nodes)}
      : null;
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
