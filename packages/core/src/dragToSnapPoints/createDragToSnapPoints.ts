// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file createDragToSnapPoints.ts
 * @input An element; the public pan (gestures/createPanGesture.ts) and the
 *   motion animator with the `springs.settle` role
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
 */

import {
  createPanGesture,
  type PanGestureEvent,
} from '../gestures/createPanGesture';
import {createMotionAnimator} from '../motion/animator';
import {resolveSnapPoint} from '../motion/resolveSnapPoint';
import {devWarn} from '../utils/devWarning';
import {registerSpringsTable, springs} from '../motion/uikit/springs';

/**
 * The release speed, in px/s, above which a drag carries to the next snap
 * point: the flick speed measured for UIKit's sheet on iOS 26.2.
 */
export const DEFAULT_FLICK_THRESHOLD = 1008;

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
 * Where `element` is drawn now, from the inline `translate` an animator
 * left on it (a drag destroyed to be created again leaves the element where
 * it stopped); 0 on an axis it does not set.
 */
function drawnAt(element: HTMLElement): {x: number; y: number} {
  const [x = 0, y = 0] = element.style
    .getPropertyValue('translate')
    .trim()
    .split(/\s+/)
    .map(part => Number.parseFloat(part))
    .map(value => (Number.isFinite(value) ? value : 0));
  return {x, y};
}

/** The usable snap points, ascending: `snapPoints` is sorted before use. */
function sortedSnapPoints(snapPoints: ReadonlyArray<number>): number[] {
  const usable = snapPoints.filter(point => Number.isFinite(point));
  if (usable.length < snapPoints.length) {
    devWarn(
      'createDragToSnapPoints',
      'snapPoints must be numbers; the others are ignored.',
    );
  }
  return usable.sort((a, b) => a - b);
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
  const {axis, onSettle} = options;
  const flickThreshold = options.flickThreshold ?? DEFAULT_FLICK_THRESHOLD;
  const points = sortedSnapPoints(options.snapPoints);
  if (points.length === 0) {
    // Nothing to settle on: the drag does nothing (spec:AST-107 FR2).
    devWarn(
      'createDragToSnapPoints',
      'snapPoints is empty, so the drag does nothing.',
    );
    return {settleTo() {}, destroy() {}};
  }
  // It starts where the element is drawn, so a drag created again to
  // change its options moves on from there instead of jumping.
  const drawn = drawnAt(element);
  const animator = createMotionAnimator(element, {initial: drawn});
  // The snap point the element rests on, or is settling toward.
  let index = resolveSnapPoint({
    points,
    position: drawn[axis],
    velocity: 0,
    flickThreshold,
  }).index;
  // Each settle and each drag takes a turn; only the latest settle reports.
  let turn = 0;
  let drag: {
    startOffset: number;
    startIndex: number;
    pointerType: string;
  } | null = null;
  let destroyed = false;
  // The pointer of the press a drag starts from, read from the press itself:
  // only a touch drag's release cross-fades under Reduce Motion, and the
  // public pan reports values only (spec:AST-107 FR1). A drag with no
  // pointer event before it (a test's bare touches) counts as a touch.
  let pressPointerType = 'touch';
  const onPointerDown = (event: PointerEvent) => {
    if (drag == null) {
      pressPointerType = event.pointerType;
    }
  };
  element.addEventListener('pointerdown', onPointerDown, {
    capture: true,
    passive: true,
  });

  const settle = (
    target: number,
    velocity: number,
    touchRelease: boolean,
  ): void => {
    registerSpringsTable();
    index = target;
    const mine = ++turn;
    const handle = animator.animate(
      {[axis]: points[target]},
      {
        spring: springs.settle,
        ...(velocity !== 0 ? {velocity: {[axis]: velocity}} : {}),
      },
      {touchRelease},
    );
    void handle.finished.then(arrived => {
      if (arrived && mine === turn && !destroyed) {
        onSettle(index);
      }
    });
  };

  const pan = createPanGesture(element, {
    axis,
    onPan: ({state, translation, velocity}: PanGestureEvent) => {
      if (destroyed) {
        return;
      }
      if (state === 'began') {
        // Catch a settle in flight where it is on screen.
        turn += 1;
        animator.stop();
        drag = {
          startOffset: animator.get(axis),
          startIndex: index,
          pointerType: pressPointerType,
        };
      }
      if (drag == null) {
        return;
      }
      const offset = drag.startOffset + translation[axis];
      if (state === 'began' || state === 'changed') {
        animator.set({[axis]: offset});
        return;
      }
      const {startIndex, startOffset, pointerType} = drag;
      drag = null;
      // Only a touch drag's release cross-fades under Reduce Motion; a mouse
      // or pen drag's lands at once (design:reduced-motion DR2, DR3).
      const touchRelease = pointerType === 'touch';
      if (state === 'cancelled') {
        settle(startIndex, 0, touchRelease);
        return;
      }
      const release = velocity[axis];
      // Core's one release policy: the nearest snap point, the next one in
      // its direction past the flick speed, and back to where the drag
      // started when the release moves back toward it (spec:AST-094 FR37).
      const {index: target} = resolveSnapPoint({
        points,
        position: offset,
        velocity: release,
        flickThreshold,
        start: startOffset,
      });
      settle(target, release, touchRelease);
    },
  });

  const snap: DragToSnapPoints = {
    settleTo(target) {
      if (destroyed) {
        return;
      }
      if (!Number.isInteger(target) || target < 0 || target >= points.length) {
        devWarn(
          'createDragToSnapPoints',
          `settleTo(${target}) is outside the ${points.length} snap points, so it does nothing.`,
        );
        return;
      }
      drag = null;
      settle(target, 0, false);
    },
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      element.removeEventListener('pointerdown', onPointerDown, {
        capture: true,
      });
      pan.destroy();
      // Held where it is: disposing cancels a running settle, which would
      // otherwise leave the element where that settle began.
      animator.stop();
      animator.dispose();
    },
  };
  return snap;
}
