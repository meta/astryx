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
 *   ref, so a new function each render re-creates nothing. The hook writes
 *   the ref at commit, so a render React discards leaves no listener. A drag
 *   costs no React render.
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
  // Keep the latest listener without re-creating the pan on every render.
  // Write it at commit: a render React discards, as a suspended transition
  // does, must not leave its listener behind.
  const onPanRef = useRef(onPan);
  useIsomorphicLayoutEffect(() => {
    onPanRef.current = onPan;
  });
  // An effect never calls `onPan`. So a drag in progress ends with no event
  // when the node or the axis changes, or at unmount.
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
