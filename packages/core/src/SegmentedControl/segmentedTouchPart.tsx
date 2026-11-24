// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file segmentedTouchPart.tsx
 * @input The shared touch modules (the animator, the press tracker) through
 *   useSegmentedSelectionMotion
 * @output `SegmentedMotion`, SegmentedControl's touch part
 * @position Loaded only through the touch loader (createTouchPart in
 *   SegmentedControl.tsx), after first paint. No other module imports it
 */

import type {RefObject} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {useCommittedRefInto} from '../hooks/useCommittedRef';
import {
  useSegmentedSelectionMotion,
  type SegmentedSelection,
} from './useSegmentedSelectionMotion';

interface SegmentedMotionProps {
  readonly trackRef: RefObject<HTMLElement | null>;
  readonly value: string;
  readonly isPresenting: boolean;
  readonly isTracking: boolean;
  /** Holds the motion's selection state while this part is mounted. */
  readonly selectionRef: RefObject<SegmentedSelection | null>;
}

/**
 * SegmentedControl's selection motion and press tracking. It renders
 * nothing. It mounts once the part has loaded, so the first press it tracks
 * is the first one after the load.
 */
export function SegmentedMotion({
  trackRef,
  value,
  isPresenting,
  isTracking,
  selectionRef,
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
  useCommittedRefInto(selectionRef, selection);
  return null;
}
