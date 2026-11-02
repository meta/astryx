// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file usePanGesture.ts
 * @input An element ref and pan options
 * @output Exports usePanGesture: the React layer of createPanGesture
 * @position Public hook in packages/core/src/hooks. It delegates entirely to
 *   createPanGesture, through Core's attachment owner (useAttachment). It
 *   keeps one pan for the element behind `ref`, re-created when the node or
 *   the axis changes, and destroyed at unmount. `onPan` is read through a
 *   ref, so a new function each render re-creates nothing. A drag costs no
 *   React render.
 * SYNC: When modified, update usePanGesture.doc.mjs and
 * ../gestures/__tests__/createPanGesture.test.tsx.
 */

import {useRef, type RefObject} from 'react';
import {
  createPanGesture,
  type PanGestureOptions,
} from '../gestures/createPanGesture';
import {useAttachment} from './useAttachment';
import {useIsomorphicLayoutEffect} from './useIsomorphicLayoutEffect';

/**
 * Report drags on the element behind `ref` as values.
 * @example
 * ```
 * const ref = useRef<HTMLDivElement>(null);
 * usePanGesture(ref, {
 *   axis: 'x',
 *   onPan: ({state, translation}) => {
 *     ref.current!.style.translate =
 *       state === 'changed' ? `${translation.x}px` : '';
 *   },
 * });
 * ```
 */
export function usePanGesture(
  ref: RefObject<Element | null>,
  options: PanGestureOptions,
): void {
  const {axis, onPan} = options;
  const onPanRef = useRef(onPan);
  // The latest listener, for the next event.
  useIsomorphicLayoutEffect(() => {
    onPanRef.current = onPan;
  });
  // One pan for the node behind `ref` with this axis. Its release destroys
  // the pan without telling the caller. An effect never calls `onPan`, so a
  // drag in progress ends silently when the node or the axis changes, or at
  // unmount.
  useAttachment(
    ref,
    element => {
      let isForwarding = true;
      const gesture = createPanGesture(element, {
        axis,
        onPan: event => {
          if (isForwarding) {
            onPanRef.current(event);
          }
        },
      });
      return () => {
        isForwarding = false;
        gesture.destroy();
      };
    },
    axis,
  );
}
