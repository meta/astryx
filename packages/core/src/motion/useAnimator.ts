// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useAnimator.ts
 * @input React (useState), the motion animator
 * @output Exports `useAnimator`: a stable animator plus the callback ref that
 *   attaches it to an element
 * @position Motion foundation (React). Internal to core; not exported from the
 *   package entry point
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
 * SYNC: When modified, update /packages/core/src/motion/useAnimator.test.tsx
 */

import {useState} from 'react';
import {createAnimator, type Animator, type AnimatorOptions} from './animator';

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
 * // Once, at module scope, so the springs are registered as their roles:
 * registerSpringsTable();
 *
 * const {ref, animator} = useAnimator();
 * // `spring` is the motion role for this move (spec:AST-094 FR4), or the
 * // component's own measured spring.
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
