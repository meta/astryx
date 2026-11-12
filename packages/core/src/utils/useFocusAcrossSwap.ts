// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useFocusAcrossSwap.ts
 * @input An optional forwarded ref and owned-content availability options
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

import {useCallback, useEffect, useRef, type Ref} from 'react';
import {mergeRefs} from './mergeRefs';

export function useFocusAcrossSwap<T extends HTMLElement>(
  ref?: Ref<T>,
  content?: {
    isDisabled: boolean;
    getFocusTarget: (node: T) => HTMLElement | null;
  },
): (node: T | null) => (() => void) | undefined {
  const isDisabled = content?.isDisabled;
  const getFocusTarget = content?.getFocusTarget;
  const focusedNodeRef = useRef<{
    node: HTMLElement;
    isDisabled: boolean | undefined;
  } | null>(null);

  // End owned-content DOM focus ownership when Activity disconnects the component.
  useEffect(() => {
    return () => {
      if (getFocusTarget) {
        focusedNodeRef.current = null;
      }
    };
  }, [getFocusTarget]);

  return useCallback(
    (node: T | null) => {
      if (node === null) {
        return undefined;
      }
      const outgoing = focusedNodeRef.current;
      focusedNodeRef.current = null;
      const target = getFocusTarget ? getFocusTarget(node) : node;
      const ownerDocument = getFocusTarget ? node.ownerDocument : document;
      const focusFell =
        ownerDocument.activeElement === ownerDocument.body ||
        (!getFocusTarget && ownerDocument.activeElement === null);
      if (
        outgoing !== null &&
        target !== null &&
        outgoing.node !== target &&
        !outgoing.node.isConnected &&
        focusFell &&
        (!getFocusTarget ||
          (target.isConnected && outgoing.isDisabled !== isDisabled))
      ) {
        if (getFocusTarget) {
          target.focus({preventScroll: true});
        } else {
          target.focus();
        }
      }
      const release = mergeRefs<T>(ref)(node);
      return () => {
        focusedNodeRef.current =
          target !== null && ownerDocument.activeElement === target
            ? {node: target, isDisabled}
            : null;
        release?.();
      };
    },
    [ref, getFocusTarget, isDisabled],
  );
}
