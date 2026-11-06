// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file createDragToSnapPoints.ts
 * @input An element; the public pan (gestures/createPanGesture.ts) and the
 *   motion animator with the `springs.settle` role
 * @output The public snap-point drag: `createDragToSnapPoints`, its options
 *   and handle
 * @position Public entry point, re-exported from the package root, and
 *   wrapped by `useDragToSnapPoints`. Importing it does no DOM work.
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
import {createMotionEngine} from '../motion/animator';
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
 * Where `element` is drawn now, read from the inline `translate` an animator
 * left on it. A drag destroyed and created again leaves it where it stopped.
 * An axis it does not set reads 0.
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

/** Drops a point that is not a finite number, with a dev warning. */
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
 * The release settles on the nearest snap point. A release faster than
 * `flickThreshold` carries to the next one in its direction. A release that
 * moves back toward the drag's start returns to the snap point it started
 * from. The settle springs from the release velocity. Under Reduce Motion,
 * the release cross-fades after a touch drag or on a coarse primary pointer,
 * and lands at once elsewhere. `settleTo(index)` settles without a drag, for
 * the keyboard.
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
    devWarn(
      'createDragToSnapPoints',
      'snapPoints is empty, so the drag does nothing.',
    );
    return {settleTo() {}, destroy() {}};
  }
  // It starts where the element is drawn, so a drag created again to
  // change its options moves on from there instead of jumping.
  const drawn = drawnAt(element);
  const animator = createMotionEngine(element, {initial: drawn});
  let targetIndex = resolveSnapPoint({
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
  // The pointer type of the press a drag starts from. A touch drag's release
  // cross-fades under Reduce Motion, as does any release on a coarse primary
  // pointer. The public pan reports values only, so the press itself is read.
  // A drag with no pointer event before it, such as bare touches, is a touch.
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
    targetIndex = target;
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
        onSettle(targetIndex);
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
          startIndex: targetIndex,
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
      const touchRelease = pointerType === 'touch';
      if (state === 'cancelled') {
        settle(startIndex, 0, touchRelease);
        return;
      }
      const release = velocity[axis];
      // Core's one release policy. The drag's start lets a release that moves
      // back return to the snap point it started from.
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
