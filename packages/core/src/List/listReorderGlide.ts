// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file listReorderGlide.ts
 * @input The shared settle role (motion/uikit/springs.ts, resolved for the
 *   list's theme) and the row motion (utils/rowMotion.ts)
 * @output `reorderGlide`: the rows' glide once a reorder commits. A drop
 *   plays it with every pointer: the dropped row from where its preview was,
 *   at the release's velocity, and the rows it passed from their old places.
 *   Under a finger's presentation, reorder mode's moves and a row's way home
 *   play it too
 * @position Imported by List/listReorderEngine.tsx alone. Under Reduce
 *   Motion the animator lands each glide at once, or cross-fades it where the
 *   primary pointer is coarse
 *
 * SYNC: When modified, update List/listReorderEngine.tsx.
 */

import {resolveMotion} from '../motion/resolveMotion';
import {
  durationBounceOf,
  toSpring,
  type DurationBounce,
  type SpringDescription,
} from '../motion/spring';
import {registerSpringsTable, springs} from '../motion/uikit/springs';
import {
  animateRow,
  animatorFor,
  motionOf,
  releaseMotion,
} from '../utils/rowMotion';

/** Releases a row's offset once its motion arrives. */
function releaseOnArrival(element: HTMLElement, arrived: Promise<boolean>) {
  void arrived.then(done => {
    if (done) {
      releaseMotion(element, 'translate');
    }
  });
}

/** The rows' motion once a reorder commits. */
export const reorderGlide = {
  /**
   * The rows' glide to their new places once a move commits: a drop or a
   * reorder mode move. It is coordinated layout movement, so it plays the
   * shared settle role, `springs.settle`, as useAnimatedLayout does. The role
   * is read once when the glide starts. Registers the springs table first.
   */
  glideBase(list: HTMLElement): DurationBounce {
    registerSpringsTable();
    return durationBounceOf(toSpring(resolveMotion(list, springs.settle)));
  },

  /**
   * The dropped row glides from where its preview was, `shift` from its new
   * place, to that place on `spring`. It starts at the release's y
   * `velocity` in px/s. Its offset goes once it arrives.
   */
  glide(
    element: HTMLElement,
    shift: number,
    spring: SpringDescription,
    at: number,
    velocity: number,
  ): void {
    animatorFor(element).rebase({y: shift}, {at});
    releaseOnArrival(
      element,
      animateRow(element, {y: 0}, spring, {at, velocity: {y: velocity}})
        .finished,
    );
  },
  /**
   * A row goes back to its place on `spring` (the dragged row from rest),
   * and its offset goes once it arrives.
   */
  home(
    element: HTMLElement,
    spring: SpringDescription,
    at: number,
    fromRest: boolean,
  ): void {
    releaseOnArrival(
      element,
      animateRow(element, {y: 0}, spring, {
        at,
        velocity: fromRest ? {y: 0} : undefined,
      }).finished,
    );
  },
  /**
   * The layout moved a row by `shift`: a commit put it in its new place. Its
   * running spring, or `spring` from rest, goes on to the new place from
   * where it is shown. The spring and velocity stay, and the target moves
   * with the layout. So the curve on screen continues: springs are memoryless.
   */
  follow(
    element: HTMLElement,
    shift: number,
    spring: SpringDescription,
    at: number,
  ): void {
    const running = motionOf(element, 'y')?.spring ?? spring;
    animatorFor(element).rebase({y: shift}, {at});
    releaseOnArrival(
      element,
      animateRow(element, {y: 0}, running, {at}).finished,
    );
  },
};
