// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useMotionAnimator.ts
 * @input React and Core's internal animator (`createMotionAnimator`)
 * @output useMotionAnimator: a stable animator and the callback ref that
 *   attaches it to an element
 * @position Lab's React binding of Core's animator, for Lab components. Lab's
 *   entry point does not export it.
 *
 * SYNC: When modified, update useMotionAnimator.test.tsx
 */

import {useState} from 'react';
import {
  createMotionAnimator,
  type MotionAnimator,
  type MotionAnimatorOptions,
} from '@astryxdesign/core/internal/touch';

export interface UseMotionAnimatorResult {
  /** Callback ref for the animated element; stable. */
  readonly ref: (element: HTMLElement | null) => void;
  /** The animator; stable for the component's lifetime. */
  readonly animator: MotionAnimator;
}

/**
 * A compositor animator bound to an element through a callback ref. The
 * animator never sets state, so a move never re-renders the component. When
 * the element unmounts, the ref detaches the animator: its moves stop and its
 * values stay, so a remount resumes from them. `options` are read on the
 * first render only.
 *
 * @example
 * ```
 * const {ref, animator} = useMotionAnimator();
 * // `spring` is the motion role for this move, or the component's own
 * // measured spring.
 * const open = () => animator.animate({y: 0}, {spring});
 * return <div ref={ref} />;
 * ```
 */
export function useMotionAnimator(
  options?: MotionAnimatorOptions,
): UseMotionAnimatorResult {
  const [result] = useState<UseMotionAnimatorResult>(() => {
    const animator = createMotionAnimator(null, options);
    return {animator, ref: element => animator.attach(element)};
  });
  return result;
}
