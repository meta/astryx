// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file createDragToSnapPoints.ts
 * @input An element; the internal snap-point drag (createSnapDrag.ts: the
 *   pan, the motion animator with the `springs.settle` role, Core's one
 *   release policy)
 * @output The public snap-point drag (`spec:AST-107` FR2, FR6):
 *   `createDragToSnapPoints`, its options and handle
 * @position Public entry point, re-exported from the package root. The
 *   `useDragToSnapPoints` hook (hooks/useDragToSnapPoints.ts) is a thin
 *   wrapper over it.
 *
 * A drag moves the element along one axis; at the release it settles on a
 * snap point (offsets in px from the element's resting position, ascending):
 * the nearest one to where it is, except that a release faster than
 * `flickThreshold` carries to the next one in its direction, and a release
 * moving back toward where the drag started returns to the snap point it
 * started from (`spec:AST-094` FR37): Core's one release policy,
 * `resolveSnapPoint`, called with the drag's start. The settle plays the `springs.settle`
 * motion role from the release velocity (FR38); under Reduce Motion a touch
 * drag's release cross-fades and a mouse or pen drag's lands at once
 * (`design:reduced-motion` DR2, DR3). `settleTo(index)` settles without a drag: the keyboard path.
 * Importing this module does no DOM work.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/dragToSnapPoints/createDragToSnapPoints.test.ts
 * - /packages/core/src/dragToSnapPoints/createDragToSnapPoints.doc.mjs
 * - /packages/core/src/hooks/useDragToSnapPoints.ts
 * - /packages/core/src/dragToSnapPoints/createSnapDrag.ts
 */

import {
  createSnapDrag,
  DEFAULT_FLICK_THRESHOLD as FLICK_THRESHOLD,
} from './createSnapDrag';
import {devWarn} from '../utils/devWarning';

/**
 * The release speed, in px/s, above which a drag carries to the next snap
 * point: the flick speed measured for UIKit's sheet on iOS 26.2.
 */
export const DEFAULT_FLICK_THRESHOLD = FLICK_THRESHOLD;

/** Options of `createDragToSnapPoints`. */
export interface DragToSnapPointsOptions {
  /** The axis the element moves along. */
  axis: 'x' | 'y';
  /**
   * Offsets in px along `axis` from the element's resting position, sorted
   * before use (`onSettle` and `settleTo` count in that order). Not viewport
   * fractions, unlike BottomSheet's `snapPoints`. An empty list makes the
   * drag do nothing and warns in development.
   */
  snapPoints: ReadonlyArray<number>;
  /**
   * A release faster than this, in px/s, carries to the next snap point in
   * its direction. Default 1008.
   */
  flickThreshold?: number;
  /** Called with the snap point's index once the element settles on it. */
  onSettle: (index: number) => void;
}

/** What `createDragToSnapPoints` returns. */
export interface DragToSnapPoints {
  /**
   * Settles the element on the snap point at `index` without a drag (the
   * keyboard path), then calls `onSettle`. An index outside the snap points
   * does nothing and warns in development.
   */
  settleTo(index: number): void;
  /** Removes every listener and stops the element where it is. */
  destroy(): void;
}

/**
 * Lets a drag move `element` along `axis` and settles it on `snapPoints` at
 * the release, then calls `onSettle(index)`.
 *
 * @example
 * ```
 * const snap = createDragToSnapPoints(drawer, {
 *   axis: 'y',
 *   snapPoints: [0, 240, 480],
 *   onSettle: index => console.log('settled on', index),
 * });
 * button.addEventListener('click', () => snap.settleTo(0));
 * // Later:
 * snap.destroy();
 * ```
 */
export function createDragToSnapPoints(
  element: HTMLElement,
  options: DragToSnapPointsOptions,
): DragToSnapPoints {
  const {axis, flickThreshold, onSettle} = options;
  if (options.snapPoints.filter(point => Number.isFinite(point)).length === 0) {
    // Nothing to settle on: the drag does nothing (spec:AST-107 FR2).
    devWarn(
      'createDragToSnapPoints',
      'snapPoints is empty, so the drag does nothing.',
    );
    return {settleTo() {}, destroy() {}};
  }
  // The public model: one for one from where the element was caught, and
  // Core's one release policy (createSnapDrag.ts).
  const snap = createSnapDrag(element, {
    axis,
    snapPoints: options.snapPoints,
    ...(flickThreshold != null ? {flickThreshold} : {}),
    onSettle,
  });
  return {
    settleTo(index) {
      snap.settleTo(index);
    },
    destroy() {
      snap.destroy();
    },
  };
}
