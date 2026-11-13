// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file rowMotion.ts
 * @input The motion foundation's animator, the theme's move curve tokens and
 *   the settle role
 * @output The moves a reorder makes on list rows, through one animator per
 *   element (`animatorFor`). `animateRow` starts a recorded spring, and
 *   `playRow` a recorded curve. `motionOf` and `isMoving` read the running
 *   one. `releaseMotion` clears the identity inline values once it rests.
 *   `motionNow` is the motion clock. `reorderGlide` is the rows' glide on
 *   the theme's move curve once a reorder commits, and the settle spring a
 *   row a drag leaves in place goes home on
 * @position Internal utility for List's reorder machinery
 *   (List/listReorderEngine.tsx), which createReorderable carries. Every
 *   motion goes through the motion foundation's shared per-element
 *   `animatorFor`, so a drop and a slide never drive one row through two
 *   animators. Under Reduce Motion the animator lands each glide at once, or
 *   cross-fades it under a coarse primary pointer.
 *
 * FLIP, compositor only. When a commit moves a row, its old place is put back
 * with an inverse `translate` in the same frame. The animator then plays it
 * to rest on the theme's move curve. A row moved again mid-motion starts a
 * new curve from where it is shown.
 *
 * SYNC: When modified, update List/listReorderEngine.tsx.
 */

import {
  animatorFor,
  isIdentityText,
  motionNow,
  type MotionCurve,
  type MotionHandle,
} from '../motion/animator';
import {mapProgress, mapRange} from '../motion/progress';
import {resolveMotion} from '../motion/resolveMotion';
import {
  durationBounceOf,
  toSpring,
  type DurationBounce,
  type SpringDescription,
} from '../motion/spring';
import {readThemeTiming} from '../motion/themeTiming';
import {registerSpringsTable, springs} from '../motion/uikit/springs';

type RowProperty = 'y' | 'rotate' | 'opacity';

/**
 * A motion started through this module: its handle, and the spring it runs
 * when it runs on one.
 */
export interface RowMotion {
  handle: MotionHandle;
  spring?: SpringDescription;
}

/** The running motion of each element, per property, until it rests. */
const motions = new WeakMap<HTMLElement, Map<RowProperty, RowMotion>>();

/** The element's shared animator (one per element, for all its motions). */
export {animatorFor, motionNow};

/** Whether a motion started here still runs on the element. */
export function isMoving(element: HTMLElement): boolean {
  return (motions.get(element)?.size ?? 0) > 0;
}

/**
 * The motion running on the element's `property`, started here, with the
 * spring it runs on; undefined once it rests.
 */
export function motionOf(
  element: HTMLElement,
  property: RowProperty = 'y',
): RowMotion | undefined {
  return motions.get(element)?.get(property);
}

function track(
  element: HTMLElement,
  properties: ReadonlyArray<RowProperty>,
  handle: MotionHandle,
  spring?: SpringDescription,
): MotionHandle {
  let running = motions.get(element);
  if (running == null) {
    running = new Map();
    motions.set(element, running);
  }
  const motion = {handle, spring};
  for (const property of properties) {
    running.set(property, motion);
  }
  const record = running;
  void handle.finished.then(() => {
    for (const property of properties) {
      if (record.get(property) === motion) {
        record.delete(property);
      }
    }
  });
  return handle;
}

/**
 * Starts a spring on the element's shared animator and records it, so a
 * later move reads its curve (`motionOf`). For a drop, or a slide to make
 * room.
 */
export function animateRow(
  element: HTMLElement,
  to: Partial<Record<RowProperty, number>>,
  spring: SpringDescription,
  options: {
    at?: number;
    velocity?: Partial<Record<RowProperty, number>>;
  },
): MotionHandle {
  const properties = Object.keys(to) as RowProperty[];
  return track(
    element,
    properties,
    animatorFor(element).animate(
      to,
      {spring, velocity: options.velocity},
      {at: options.at},
    ),
    spring,
  );
}

/**
 * Plays curves on the element's shared animator and records them, so a later
 * move knows the row still moves (`isMoving`). For a glide on the theme's
 * move curve.
 */
export function playRow(
  element: HTMLElement,
  curves: Partial<Record<RowProperty, MotionCurve>>,
  options: {at?: number},
): MotionHandle {
  const properties = Object.keys(curves) as RowProperty[];
  return track(
    element,
    properties,
    animatorFor(element).play(curves, {at: options.at}),
  );
}

/**
 * Clears the element's identity inline values once it rests, so a resting
 * row carries no `translate`. A transform makes it a containing block for
 * fixed descendants. The animator stays: other code may hold it, and its
 * state still reads the resting value. Nothing is cleared while a newer
 * motion runs on the element.
 */
export function releaseMotion(
  element: HTMLElement,
  ...properties: ReadonlyArray<'translate' | 'rotate' | 'opacity'>
): void {
  if (isMoving(element)) {
    return;
  }
  for (const property of properties) {
    // Other code may hold the same channel off rest, such as a swipe's x on
    // `translate`. Only identity values are ours to clear.
    if (isIdentityText(property, element.style.getPropertyValue(property))) {
      element.style.removeProperty(property);
    }
  }
}

/** Releases a row's offset once its motion arrives. */
function releaseOnArrival(element: HTMLElement, arrived: Promise<boolean>) {
  void arrived.then(done => {
    if (done) {
      releaseMotion(element, 'translate');
    }
  });
}

/** The rows' motion once a reorder commits, and the way home. */
export const reorderGlide = {
  /**
   * The theme's move curve where `list` is: `--ease-move` over
   * `--duration-medium`, the curve every layout glide plays. Its tokens follow
   * the theme's `character` and `tempo`. Read once per commit. Null when its
   * duration is zero: the rows then land at once.
   */
  moveCurve(list: HTMLElement): MotionCurve | null {
    return readThemeTiming(list, {
      duration: '--duration-medium',
      easing: '--ease-move',
    });
  },

  /**
   * A commit moved a row `shift` in the layout: a drop or a reorder mode
   * move. From where it is shown, it glides to its new place on `progress`,
   * the theme's move curve. Its offset goes once it arrives.
   */
  slide(
    element: HTMLElement,
    shift: number,
    progress: MotionCurve,
    at: number,
  ): void {
    const animator = animatorFor(element);
    animator.rebase({y: shift}, {at});
    const from = animator.get('y', at);
    // Unclamped, so a curve that overshoots carries the row with it.
    const toward = mapProgress(
      progress,
      mapRange([0, 1], [from, 0], {clamp: false}),
    );
    releaseOnArrival(element, playRow(element, {y: toward}, {at}).finished);
  },

  /**
   * The spring a row takes home on under a finger when a drag ends without a
   * move. It starts from where the row is shown. It is the shared settle
   * role, `springs.settle`. Read once. Registers the springs table first.
   */
  homeSpring(list: HTMLElement): DurationBounce {
    registerSpringsTable();
    return durationBounceOf(toSpring(resolveMotion(list, springs.settle)));
  },

  /**
   * A row goes back to its place on `spring`, keeping the speed it has, and
   * its offset goes once it arrives.
   */
  home(element: HTMLElement, spring: SpringDescription, at: number): void {
    releaseOnArrival(
      element,
      animateRow(element, {y: 0}, spring, {at}).finished,
    );
  },
};
