// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file touchRuntimeModules.tsx
 * @input The shared touch modules: the animator, and the touch parts of
 *   SegmentedControl and Switch, which use the gesture host
 * @output `touchRuntime`, the one object the touch loader publishes
 * @position Loaded only through `import()` in utils/touchRuntime.ts. No
 *   other module imports this file
 */

import type {RefObject} from 'react';
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

/** What the touch loader publishes once the page has loaded it. */
export const touchRuntime = {
  animatorFor,
  SegmentedMotion,
  SwitchTouch,
} as const;

export type TouchRuntime = typeof touchRuntime;
