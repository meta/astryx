// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useAnimator.ts
 * @input React (useState), the element ref the caller owns, the public
 *   animator factory (animator/createAnimator.ts) and useAttachment
 * @output Exports `useAnimator(ref)`: the public animator for the element
 *   behind `ref`
 * @position Public hook, exported from `@astryxdesign/core/hooks`. A thin
 *   wrapper over `createAnimator` with no behavior of its own.
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
import {useAttachment} from './useAttachment';

/**
 * Animates the element behind `ref` with the motion Core uses. Call
 * `animate`, `decay`, `set`, `get`, `getVelocity` or `stop` on the returned
 * animator from event handlers and effects. Pass the same `ref` to a gesture
 * hook to drag and animate one element.
 *
 * The hook makes the animator once, and animating never re-renders the
 * component. After each commit, the animator follows the element behind
 * `ref`, also a node that replaces it. An unmount stops running motion and
 * drops the values. A remount, or a node that replaces the element, starts
 * at rest. While no element is attached, every call does nothing, and
 * `animate` and `decay` resolve at once.
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
    return {
      handle,
      attach: (element: HTMLElement) => {
        attachElement(element);
        return () => attachElement(null);
      },
    };
  });
  useAttachment(ref, attach, null);
  return handle;
}
