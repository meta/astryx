// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useNavigationLink.ts
 * @input The enclosing NavigationStack's API (useNavigationStack), and Core's
 *   press tracker (usePressTracker)
 * @output Exports useNavigationLink: the ref and activation of a control that
 *   pushes one entry. It prepares the entry's screen when a press goes down,
 *   drops it when the press ends off the control or a scroll takes it, and
 *   pushes at the activation
 * @position Lab component (packages/lab/src/NavigationStack); an opt-in hook
 *   apart from the stack, so a stack that does not prepare screens carries
 *   none of it
 */

import {usePressTracker} from '@astryxdesign/core/internal/touch';
import {useCallback, useRef} from 'react';
import {useNavigationStack} from './NavigationStack';

/** What a control that pushes one entry takes. */
export interface NavigationLinkProps {
  ref: (element: Element | null) => void;
  onClick: () => void;
}

/**
 * The ref and activation of a control that pushes `entry`. A press going
 * down prepares the screen. A release off the control, or a scroll that takes
 * the touch, drops it. The activation pushes it.
 */
export function useNavigationLink<T>(entry: T): NavigationLinkProps {
  const stack = useNavigationStack<T>();
  const elementRef = useRef<Element | null>(null);
  usePressTracker(elementRef, {
    onControlEvent: event => {
      if (event === 'touchDown') {
        stack.prepare(entry);
      } else if (event === 'touchUpOutside' || event === 'touchCancel') {
        stack.drop();
      }
    },
  });
  const ref = useCallback((element: Element | null) => {
    elementRef.current = element;
  }, []);
  const onClick = useCallback(() => stack.push(entry), [entry, stack]);
  return {ref, onClick};
}
