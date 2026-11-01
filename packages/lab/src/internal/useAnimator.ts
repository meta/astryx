// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useAnimator.ts
 * @input React (useState), Core's animator (`@astryxdesign/core/internal/motion`)
 * @output Exports `useAnimator`: a stable animator plus the callback ref that
 *   attaches it to an element
 * @position Lab's React binding of Core's animator, for Lab components; not
 *   exported from Lab's entry point
 *
 * The animator lives outside React's render cycle: the hook creates it once,
 * returns the same object on every render, and nothing it does ever sets
 * state, so animating, retargeting or tracking a finger never re-renders the
 * component (law M4). The ref attaches the animator when the element mounts
 * and detaches it (cancelling its running animations, keeping its state) when
 * the element unmounts; a remount resumes from the presentation values, which
 * also covers React's development double mount.
 *
 * `options` are read on the first render only.
 *
 * SYNC: When modified, update useAnimator.test.tsx
 */

import {useState} from 'react';
import {
  createAnimator,
  type Animator,
  type AnimatorOptions,
} from '@astryxdesign/core/internal/motion';

export interface UseAnimatorResult {
  /** Callback ref for the animated element; stable. */
  readonly ref: (element: HTMLElement | null) => void;
  /** The animator; stable for the component's lifetime. */
  readonly animator: Animator;
}

/**
 * A compositor animator bound to an element through a callback ref.
 *
 * @example
 * ```
 * const {ref, animator} = useAnimator();
 * // `spring` is the motion role for this move, or the component's own
 * // measured spring.
 * const open = () => animator.animate({y: 0}, {spring});
 * return <div ref={ref} />;
 * ```
 */
export function useAnimator(options?: AnimatorOptions): UseAnimatorResult {
  const [result] = useState<UseAnimatorResult>(() => {
    const animator = createAnimator(null, options);
    return {animator, ref: element => animator.attach(element)};
  });
  return result;
}
