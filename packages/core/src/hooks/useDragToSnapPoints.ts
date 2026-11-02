// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useDragToSnapPoints.ts
 * @input React, the public snap-point drag factory
 *   (dragToSnapPoints/createDragToSnapPoints.ts)
 * @output Exports `useDragToSnapPoints`: a drag that settles the element `ref`
 *   points at on snap points (`spec:AST-107` FR2)
 * @position Public hook, exported from `@astryxdesign/core/hooks`. A thin
 *   wrapper over `createDragToSnapPoints` with no behavior of its own (FR6).
 *
 * The factory attaches to the element behind `ref` after each commit that
 * mounts or replaces it (`architecture:react-component-runtime` INV6), and
 * is destroyed when it unmounts. Any option change creates the drag again
 * and does nothing more: the element stays where it is, a settle in flight
 * included, and the next drag or `settleTo` starts there. The latest
 * `onSettle` is the one called, so it may be a new function on every render,
 * and `settleTo` is the same function on every render.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/useDragToSnapPoints.test.tsx
 * - /packages/core/src/hooks/useDragToSnapPoints.doc.mjs
 */

import {useRef, useState} from 'react';
import type {RefObject} from 'react';
import {
  createDragToSnapPoints,
  type DragToSnapPoints,
  type DragToSnapPointsOptions,
} from '../dragToSnapPoints/createDragToSnapPoints';
import {useAttachment} from './useAttachment';
import {useIsomorphicLayoutEffect} from './useIsomorphicLayoutEffect';

export interface UseDragToSnapPointsResult {
  /**
   * Settles the element on the snap point at `index` without a drag: the
   * keyboard path. The same function on every render.
   */
  readonly settleTo: (index: number) => void;
}

/**
 * Lets a drag move the element along `axis` and settles it on `snapPoints`
 * at the release.
 *
 * @example
 * ```
 * const ref = useRef<HTMLDivElement>(null);
 * const {settleTo} = useDragToSnapPoints(ref, {
 *   axis: 'y',
 *   snapPoints: [0, 240, 480],
 *   onSettle: setIndex,
 * });
 * ```
 */
export function useDragToSnapPoints(
  ref: RefObject<HTMLElement | null>,
  options: DragToSnapPointsOptions,
): UseDragToSnapPointsResult {
  const {axis, snapPoints, flickThreshold} = options;
  const onSettleRef = useRef(options.onSettle);
  useIsomorphicLayoutEffect(() => {
    onSettleRef.current = options.onSettle;
  });
  const snapRef = useRef<DragToSnapPoints | null>(null);
  // The snap points as a value, so a new array with the same points keeps
  // the drag (an empty list stays empty).
  const points = JSON.stringify(snapPoints);
  // One drag for the node behind `ref`, kept by Core's one attachment owner:
  // a node mounted or replaced later is driven too (INV6), and any option
  // change creates the drag again through the factory and does nothing more
  // (spec:AST-107 FR6). Destroying the old drag leaves the element where it
  // is, a settle in flight included, and the new one starts there.
  useAttachment(
    ref,
    element => {
      const snap = createDragToSnapPoints(element, {
        axis,
        snapPoints: JSON.parse(points) as number[],
        flickThreshold,
        onSettle: index => onSettleRef.current(index),
      });
      snapRef.current = snap;
      return () => {
        snap.destroy();
        if (snapRef.current === snap) {
          snapRef.current = null;
        }
      };
    },
    `${axis} ${points} ${flickThreshold ?? ''}`,
  );
  const [result] = useState<UseDragToSnapPointsResult>(() => ({
    settleTo: index => snapRef.current?.settleTo(index),
  }));
  return result;
}
