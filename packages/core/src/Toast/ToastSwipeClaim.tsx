// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ToastSwipeClaim.tsx
 * @input Uses the gesture host's one-way pan and the Toast card root
 * @output Exports `ToastSwipeClaim`, which renders nothing and attaches the
 *   pan that claims a finger's touch for the toast's swipe
 * @position Internal to Toast: loads at idle or with the first toast
 *   (lazyToastSwipeClaim.ts)
 */

import {useEffect, type ReactElement, type RefObject} from 'react';
import {PanGestureRecognizer} from '../gestures/PanGestureRecognizer';
import {useGestureRecognizer} from '../gestures/useGestureRecognizer';
import type {ToastGestureDirection} from './useToastGesture';

export interface ToastSwipeClaimProps {
  rootRef: RefObject<HTMLDivElement | null>;
  direction: ToastGestureDirection;
  isEnabled: boolean;
  shouldIgnoreTargetRef: RefObject<
    (target: EventTarget | null, root: HTMLElement) => boolean
  >;
  onClaim: (claim: PanGestureRecognizer | null) => void;
}

export function ToastSwipeClaim({
  rootRef,
  direction,
  isEnabled,
  shouldIgnoreTargetRef,
  onClaim,
}: ToastSwipeClaimProps): ReactElement | null {
  // The pan holds a touch whose first move goes toward the edge, and fails on
  // any other first move. It only claims, so it never begins.
  const claim = useGestureRecognizer(
    rootRef,
    () =>
      new PanGestureRecognizer({
        name: 'toast-swipe',
        direction: direction === 1 ? 'down' : 'up',
        firstMoveDecides: true,
        maximumNumberOfTouches: 1,
        hysteresis: Number.POSITIVE_INFINITY,
        cancelsTouchesInView: false,
        shouldReceiveTouch: (_recognizer, touch) => {
          const root = rootRef.current;
          return (
            touch.pointerType === 'touch' &&
            root != null &&
            !shouldIgnoreTargetRef.current(touch.target as EventTarget, root)
          );
        },
      }),
    undefined,
    {isEnabled, manageStyle: false},
  );
  // Syncs the gesture host's pan with the edge this toast dismisses toward.
  useEffect(() => {
    claim.setDirection(direction === 1 ? 'down' : 'up');
  }, [claim, direction]);
  // Syncs the toast's swipe with the gesture host's pan: the swipe reads the
  // pan's verdict.
  useEffect(() => {
    onClaim(claim);
    return () => onClaim(null);
  }, [claim, onClaim]);
  return null;
}
