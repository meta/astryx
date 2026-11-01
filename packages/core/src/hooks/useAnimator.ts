// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useAnimator.ts
 * @input React (useState), the element ref the caller owns, the public
 *   animator factory (animator/createAnimator.ts)
 * @output Exports `useAnimator(ref)`: the public animator for the element
 *   behind `ref` (`spec:AST-107` FR3)
 * @position Public hook, exported from `@astryxdesign/core/hooks`. A thin
 *   wrapper over `createAnimator` with no behavior of its own (FR6).
 *
 * The hook takes the caller's element ref, as the gesture hooks do, so a drag
 * and an animation can share one element. The animator lives outside React's
 * render cycle: the hook makes it once, returns the same object on every
 * render, and nothing it does sets state, so animating never re-renders the
 * component. After every commit it follows the element behind the ref: it
 * attaches the element when it mounts, moves to a node that replaces it, and
 * lets it go when it unmounts (running motion stops, the values stay); a
 * remount resumes from them. While no element is attached, every call does
 * nothing, and `animate` and `decay` resolve at once.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/useAnimator.test.tsx
 * - /packages/core/src/hooks/useAnimator.doc.mjs
 */

import {useState, type RefObject} from 'react';
import {
  createAttachableAnimator,
  type AnimatorHandle,
} from '../animator/createAnimator';
import {useIsomorphicLayoutEffect} from './useIsomorphicLayoutEffect';

/**
 * Animates the element behind `ref` with the motion Core uses: call
 * `animate`, `decay`, `set`, `get`, `getVelocity` or `stop` on the returned
 * animator from event handlers and effects. Pass the same `ref` to a gesture
 * hook to drag and animate one element.
 *
 * @example
 * ```
 * const ref = useRef<HTMLDivElement>(null);
 * const animator = useAnimator(ref);
 * return (
 *   <div ref={ref} onClick={() => animator.animate({scale: 1.2})}>
 *     Card
 *   </div>
 * );
 * ```
 */
export function useAnimator(
  ref: RefObject<HTMLElement | null>,
): AnimatorHandle {
  const [{handle, attach}] = useState(() => {
    const {animator, attach: attachElement} = createAttachableAnimator();
    // The handle without `destroy`: the hook owns the element's lifetime.
    const {destroy: _destroy, ...handle} = animator;
    return {handle, attach: attachElement};
  });
  // Syncs the animator with the element behind the caller's ref after every
  // commit: a mounted node is attached, a replacing node takes its place, and
  // an unmounted one is let go.
  useIsomorphicLayoutEffect(() => {
    attach(ref.current);
  });
  // Lets the element go when the component unmounts.
  useIsomorphicLayoutEffect(() => () => attach(null), [attach]);
  return handle;
}
