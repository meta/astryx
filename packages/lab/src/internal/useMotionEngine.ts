// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useMotionEngine.ts
 * @input React and Core's motion engine (`createMotionEngine`)
 * @output useMotionEngine: a stable motion engine and the callback ref that
 *   attaches it to an element
 * @position Lab's React binding of Core's motion engine, for Lab components.
 *   Lab's entry point does not export it.
 *
 * SYNC: When modified, update useMotionEngine.test.tsx
 */

import {useState} from 'react';
import {
  createMotionEngine,
  type MotionEngine,
  type MotionEngineOptions,
} from '@astryxdesign/core/internal/touch';

export interface UseMotionEngineResult {
  /** Callback ref for the animated element; stable. */
  readonly ref: (element: HTMLElement | null) => void;
  /** The animator; stable for the component's lifetime. */
  readonly animator: MotionEngine;
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
 * const {ref, animator} = useMotionEngine();
 * // `spring` is the motion role for this move, or the component's own
 * // measured spring.
 * const open = () => animator.animate({y: 0}, {spring});
 * return <div ref={ref} />;
 * ```
 */
export function useMotionEngine(
  options?: MotionEngineOptions,
): UseMotionEngineResult {
  const [result] = useState<UseMotionEngineResult>(() => {
    const animator = createMotionEngine(null, options);
    return {animator, ref: element => animator.attach(element)};
  });
  return result;
}
