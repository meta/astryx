// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file listReorderGlide.ts
 * @input The theme's move curve tokens (motion/themeTiming.ts), the shared
 *   settle role (motion/uikit/springs.ts) and the row motion
 *   (utils/rowMotion.ts)
 * @output `reorderGlide`: the rows' glide once a reorder commits, on the
 *   theme's move curve. A drop plays it with every pointer: each row it moved,
 *   the dropped row included, from its place before the drag. Under a
 *   finger's presentation, reorder mode's moves play it too, and a row the
 *   drag leaves where it was goes home on the settle spring
 * @position Imported by List/listReorderEngine.tsx alone. Under Reduce
 *   Motion the animator lands each glide at once, or cross-fades it where the
 *   primary pointer is coarse
 *
 * SYNC: When modified, update List/listReorderEngine.tsx.
 */

import type {MotionCurve} from '../motion/animator';
import {mapProgress, mapRange} from '../motion/progress';
import {resolveMotion} from '../motion/resolveMotion';
import {
  durationBounceOf,
  toSpring,
  type DurationBounce,
  type SpringDescription,
} from '../motion/spring';
import {registerSpringsTable, springs} from '../motion/uikit/springs';
import {readThemeTiming} from '../motion/themeTiming';
import {
  animateRow,
  animatorFor,
  playRow,
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
   * The spring a row takes home on under a finger, from where it is shown,
   * when a drag ends without a move: the shared settle role,
   * `springs.settle`. Read once. Registers the springs table first.
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
