// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useAttachment.ts
 * @input Node refs (an element's, or the document's), an attach function
 *   and a key
 * @output Exports useAttachment and useAttachmentPair (two elements): they keep
 *   the attach function bound to the nodes the refs hold across commits
 * @position Internal React helper, not in hooks/index.ts: the one attach and
 *   release lifecycle of the gesture hooks, the pager and useAnimator
 *
 * SYNC: When modified, update gestures/__tests__/useGestureRecognizer.test.tsx,
 * gestures/__tests__/useFingerScroll.test.tsx and
 * __tests__/useAttachmentPair.test.tsx.
 */

import {useRef, type RefObject} from 'react';
import {useIsomorphicLayoutEffect} from './useIsomorphicLayoutEffect';

/**
 * Keep `attach` bound to the node `ref` holds after each commit: an element,
 * or the document. A replaced node is released and the new one attached, a
 * changed `key` re-attaches, and the last attachment is released on unmount;
 * a commit that changes neither does nothing (react-component-runtime INV3).
 * With `followsDocument`, a node that moves to another document is released
 * and attached again.
 */
export function useAttachment<T extends Node = Element>(
  ref: RefObject<T | null>,
  attach: (element: T) => () => void,
  key: unknown,
  options?: AttachmentOptions,
): void {
  useAttachedNodes(
    [ref],
    ([node]) => attach(node as T),
    key,
    options?.followsDocument === true,
  );
}

/** What else an attachment follows, besides its node and its key. */
export interface AttachmentOptions {
  /**
   * Attach again when the node moves to another document, for an attachment
   * that listens on the node's document.
   */
  readonly followsDocument?: boolean;
}

/**
 * `useAttachment` for two elements. It keeps `attach` bound to the pair the
 * refs hold after each commit, once both are there. Replacing either element
 * releases the attachment and attaches the new pair. A changed `key`
 * re-attaches, and the last attachment is released on unmount. A commit that
 * changes neither does nothing.
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
    false,
  );
}

/**
 * The lifecycle both share: one attachment of the nodes the refs hold. It
 * attaches once every node is there. It releases the attachment at unmount
 * and when a node or `key` changes, or with `followsDocument`, a document.
 */
function useAttachedNodes(
  refs: ReadonlyArray<RefObject<Node | null>>,
  attach: (nodes: ReadonlyArray<Node>) => () => void,
  key: unknown,
  followsDocument: boolean,
): void {
  const attachmentRef = useRef<{
    nodes: ReadonlyArray<Node>;
    documents: ReadonlyArray<Document | null>;
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
      nodes.every(
        (node, index) =>
          node === current.nodes[index] &&
          (!followsDocument || node.ownerDocument === current.documents[index]),
      )
    ) {
      return;
    }
    current?.release();
    attachmentRef.current = nodes.every(node => node != null)
      ? {
          nodes: nodes,
          documents: nodes.map(node => node.ownerDocument),
          key,
          release: attach(nodes),
        }
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
