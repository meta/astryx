// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file touchRuntimeModules.tsx
 * @input The shared touch modules: the animator, and the touch parts of
 *   SegmentedControl, Switch, Toast and Popover, which use the animator and
 *   the gesture host
 * @output `touchRuntime`, the one object the touch loader publishes
 * @position Loaded only through `import()` in utils/touchRuntime.ts. No
 *   other module imports this file
 */

import {useEffect, useRef, type RefObject} from 'react';
import {animatorFor} from '../motion/animator';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {
  useSegmentedSelectionMotion,
  type SegmentedSelection,
} from '../SegmentedControl/useSegmentedSelectionMotion';
import {
  useSwitchTouch,
  type SwitchTouchOptions,
  type SwitchTouchParts,
} from '../Switch/useSwitchTouch';
import {PanGestureRecognizer} from '../gestures/PanGestureRecognizer';
import {useGestureRecognizer} from '../gestures/useGestureRecognizer';
import {createPopoverSurfaceMotion} from '../Popover/popoverSurfaceMotion';
import type {ToastSwipeClaimProps} from '../Toast/useToastGesture';

interface SegmentedMotionProps {
  readonly trackRef: RefObject<HTMLElement | null>;
  readonly value: string;
  readonly isPresenting: boolean;
  readonly isTracking: boolean;
  /** Receives the motion's selection state on mount, and `null` on unmount. */
  readonly onSelection: (selection: SegmentedSelection | null) => void;
}

/**
 * SegmentedControl's selection motion and press tracking. It renders
 * nothing. It mounts once the runtime has loaded, so the first press it
 * tracks is the first one after the load.
 */
function SegmentedMotion({
  trackRef,
  value,
  isPresenting,
  isTracking,
  onSelection,
}: SegmentedMotionProps): null {
  const {selection, attachTrack} = useSegmentedSelectionMotion(
    trackRef,
    value,
    isPresenting,
    isTracking,
  );
  // Syncs the motion's animators with the radiogroup node.
  useIsomorphicLayoutEffect(() => {
    const detach = attachTrack(trackRef.current);
    return typeof detach === 'function' ? detach : undefined;
  }, [attachTrack, trackRef]);
  // Syncs the control's selection state with this part's motion.
  useIsomorphicLayoutEffect(() => {
    onSelection(selection);
    return () => onSelection(null);
  }, [selection, onSelection]);
  return null;
}

interface SwitchTouchProps {
  readonly parts: SwitchTouchParts;
  readonly options: SwitchTouchOptions;
}

/**
 * Switch's touch presentation: the thumb drag and its springs. It renders
 * nothing. It mounts once the runtime has loaded.
 */
function SwitchTouch({parts, options}: SwitchTouchProps): null {
  useSwitchTouch(parts, options);
  return null;
}

/**
 * A toast's claim on a finger's touch: the gesture host's one-way pan, which
 * claims the touch and never begins. It renders nothing. It mounts once the
 * runtime has loaded, so the first touch it claims is the first one after
 * the load.
 */
function ToastSwipeClaim({
  rootRef,
  direction,
  isEnabled,
  shouldReceive,
  onClaim,
}: ToastSwipeClaimProps): null {
  const shouldReceiveRef = useRef(shouldReceive);
  // Syncs the pan's touch filter with the toast's newest one.
  useIsomorphicLayoutEffect(() => {
    shouldReceiveRef.current = shouldReceive;
  });
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
        shouldReceiveTouch: (_recognizer, touch) =>
          touch.pointerType === 'touch' &&
          shouldReceiveRef.current(touch.target as EventTarget),
      }),
    undefined,
    {isEnabled, manageStyle: false},
  );
  // Syncs the gesture host's pan with the edge this toast dismisses toward.
  useEffect(() => {
    claim.setDirection(direction === 1 ? 'down' : 'up');
  }, [claim, direction]);
  // Syncs the toast's swipe with this part's pan.
  useIsomorphicLayoutEffect(() => {
    onClaim(claim);
    return () => onClaim(null);
  }, [claim, onClaim]);
  return null;
}

/** What the touch loader publishes once the page has loaded it. */
export const touchRuntime = {
  animatorFor,
  createPopoverSurfaceMotion,
  SegmentedMotion,
  SwitchTouch,
  ToastSwipeClaim,
} as const;

export type TouchRuntime = typeof touchRuntime;
