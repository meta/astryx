// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useFocusAcrossSwap.ts
 * @input An optional forwarded ref and focus-target options
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
import {isHTMLElement} from './nodeType';

function isNativeTarget(value: unknown): value is HTMLElement {
  // A router ref can hold an instance instead of an HTML element.
  return (
    isHTMLElement(value) &&
    typeof value.getRootNode === 'function' &&
    typeof value.focus === 'function'
  );
}

function focusRoot(element: Element): Document | ShadowRoot | null {
  const root = element.getRootNode();
  if (!('activeElement' in root)) {
    return null;
  }
  const focusRoot = root as Document | ShadowRoot;
  if (!('host' in focusRoot)) {
    const view = focusRoot.defaultView;
    // frameElement is also null for cross-origin parents; do not infer lost focus.
    if (
      view &&
      view.parent !== view &&
      view.frameElement === null &&
      !focusRoot.hasFocus()
    ) {
      return null;
    }
  }
  return focusRoot;
}

function wasHidden(node: HTMLElement): boolean {
  // A hidden Activity can commit another change before microtasks run.
  for (
    let ancestor: HTMLElement | null = node;
    ancestor;
    ancestor = ancestor.parentElement
  ) {
    if (ancestor.style.display === 'none') {
      return true;
    }
  }
  return false;
}

function ownsFocus(element: Element): boolean {
  // An iframe can retain activeElement after focus leaves its document.
  const root = focusRoot(element);
  if (!root || root.activeElement !== element) {
    return false;
  }
  const owner = 'host' in root ? root.host : root.defaultView?.frameElement;
  return owner == null || ownsFocus(owner);
}

function focusIsUnclaimed(element: Element): boolean {
  const root = focusRoot(element);
  if (!root) {
    return false;
  }
  if ('host' in root) {
    // A host fallback can be a caller's chosen focus target.
    // Do not restore focus when that ownership is ambiguous.
    return root.activeElement == null && focusIsUnclaimed(root.host);
  }
  const frame = root.defaultView?.frameElement;
  return (
    (root.activeElement == null || root.activeElement === root.body) &&
    (frame == null || ownsFocus(frame) || focusIsUnclaimed(frame))
  );
}

export function useFocusAcrossSwap<T extends HTMLElement>(
  ref?: Ref<T>,
  {
    getFocusTarget,
  }: {
    getFocusTarget?: (node: T) => HTMLElement | null;
  } = {},
): (node: T | null) => (() => void) | undefined {
  const focusedNodeRef = useRef<{
    target: HTMLElement;
    source: T;
  } | null>(null);

  // Activity keeps hidden DOM; its focus handoff must not survive a disconnect.
  useEffect(() => {
    return () => {
      focusedNodeRef.current = null;
    };
  }, [getFocusTarget]);
  return useCallback(
    (node: T | null) => {
      if (node === null) {
        return undefined;
      }
      const outgoing = focusedNodeRef.current;
      focusedNodeRef.current = null;
      const resolved = getFocusTarget ? getFocusTarget(node) : node;
      const target = isNativeTarget(resolved) ? resolved : null;
      if (
        target?.isConnected &&
        outgoing !== null &&
        outgoing.target !== target &&
        !outgoing.target.isConnected &&
        !wasHidden(outgoing.source) &&
        focusIsUnclaimed(target)
      ) {
        target.focus({preventScroll: true});
      }
      const release = mergeRefs<T>(ref)(node);
      return () => {
        const outgoing =
          target && ownsFocus(target) ? {target, source: node} : null;
        focusedNodeRef.current = outgoing;
        if (outgoing) {
          // Descendant refs can detach without disconnecting this hook's Effect.
          // Expire the handoff after this commit, but leave newer handoffs intact.
          queueMicrotask(() => {
            if (focusedNodeRef.current === outgoing) {
              focusedNodeRef.current = null;
            }
          });
        }
        release?.();
      };
    },
    [ref, getFocusTarget],
  );
}
