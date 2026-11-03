// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useFocusAcrossSwap.ts
 * @input An optional forwarded ref
 * @output A callback ref that carries focus to a replacement element
 * @position Internal hook for a component whose element type changes with a
 *   prop (a link row that renders a plain anchor while disabled). React
 *   replaces the element, so focus would fall to the page; spec:AST-085 FR4
 *   keeps it on the row.
 *
 * The ref cleanup runs before the old node is removed, so `activeElement` is
 * still readable there. Only a different node replacing a removed one takes
 * focus, and only if focus has fallen to the page: React also detaches and
 * re-attaches the same node (for example when an <Activity> boundary hides and
 * reveals it), and neither case may pull focus back after the person has moved
 * elsewhere.
 */

import {useCallback, useRef, type Ref} from 'react';
import {mergeRefs} from './mergeRefs';

export function useFocusAcrossSwap<T extends HTMLElement>(
  ref?: Ref<T>,
): (node: T | null) => (() => void) | undefined {
  const focusedNodeRef = useRef<T | null>(null);
  return useCallback(
    (node: T | null) => {
      if (node === null) {
        return undefined;
      }
      const outgoing = focusedNodeRef.current;
      focusedNodeRef.current = null;
      const focusFell =
        document.activeElement === null ||
        document.activeElement === document.body;
      if (
        outgoing !== null &&
        outgoing !== node &&
        !outgoing.isConnected &&
        focusFell
      ) {
        node.focus();
      }
      const release = mergeRefs<T>(ref)(node);
      return () => {
        focusedNodeRef.current = document.activeElement === node ? node : null;
        release?.();
      };
    },
    [ref],
  );
}
