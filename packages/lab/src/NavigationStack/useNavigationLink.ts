// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useNavigationLink.ts
 * @input The enclosing NavigationStack's API (useNavigationStack)
 * @output Exports useNavigationLink: the press props of a control that pushes
 *   one entry. It prepares the entry's screen at the press, drops it when the
 *   press ends with no activation or a scroll takes the touch, and pushes at
 *   the activation
 * @position Lab component (packages/lab/src/NavigationStack); an opt-in hook
 *   apart from the stack, so a stack that does not prepare screens carries
 *   none of it
 */

import {useCallback, type PointerEvent} from 'react';
import {useNavigationStack} from './NavigationStack';

/** The props a control that pushes one entry spreads. */
export interface NavigationLinkProps {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
  onClick: () => void;
}

/** Whether a value is a node, by its node type (it may be another window's). */
function isNode(value: unknown): value is Node {
  return (
    typeof value === 'object' &&
    value != null &&
    typeof (value as Partial<Node>).nodeType === 'number'
  );
}

/**
 * The press props of a control that pushes `entry`. Its first pointerdown
 * prepares the screen. A scroll that takes the touch cancels the pointer and
 * drops it, as does a release off the control. The activation pushes it.
 */
export function useNavigationLink<T>(entry: T): NavigationLinkProps {
  const stack = useNavigationStack<T>();
  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      stack.prepare(entry);
      const control = event.currentTarget;
      const view = control.ownerDocument.defaultView;
      // A release off the control activates nothing, so it drops the screen.
      view?.addEventListener(
        'pointerup',
        up => {
          if (!isNode(up.target) || !control.contains(up.target)) {
            stack.drop();
          }
        },
        {once: true, capture: true},
      );
    },
    [entry, stack],
  );
  const onPointerCancel = useCallback(() => stack.drop(), [stack]);
  const onClick = useCallback(() => stack.push(entry), [entry, stack]);
  return {onPointerDown, onPointerCancel, onClick};
}
