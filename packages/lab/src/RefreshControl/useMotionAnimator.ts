// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useMotionAnimator.ts
 * @input Core's internal motion animator (internal/touch)
 * @output useMotionAnimator: one motion animator for a component's lifetime,
 *   and the ref that attaches it to an element
 * @position Internal to useRefreshControl; refreshTouchController calls it.
 *   Core's public `useAnimator` plays only the theme's state-change motion.
 */

import {useState} from 'react';
import {
  createMotionAnimator,
  type MotionAnimator,
  type MotionAnimatorOptions,
} from '@astryxdesign/core/internal/touch';

export interface UseMotionAnimatorResult {
  readonly ref: (element: HTMLElement | null) => void;
  readonly animator: MotionAnimator;
}

/** One motion animator for the component's lifetime, attached through `ref`. */
export function useMotionAnimator(
  options?: MotionAnimatorOptions,
): UseMotionAnimatorResult {
  const [result] = useState<UseMotionAnimatorResult>(() => {
    const animator = createMotionAnimator(null, options);
    return {animator, ref: element => animator.attach(element)};
  });
  return result;
}
