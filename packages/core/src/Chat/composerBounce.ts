// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file composerBounce.ts
 * @input The keyboard's spring as a motion role, the spring solver, Core's
 *   Reduced Motion policy, a finger's speed and how deep the bounce may go
 * @output bounceComposer: one small spring bounce of the composer's dock
 * @position Internal to Chat. ChatLayout plays it on its dock container as a
 *   drag dismisses the keyboard. So the composer, the frosted layer and the
 *   scroll-to-bottom button move as one.
 */

import {reducedMotionFade} from '../motion/reducedMotion';
import {resolveMotion} from '../motion/resolveMotion';
import {solveSpring, toSpring} from '../motion/spring';
import {springs} from '../motion/uikit/springs';

/** One keyframe per frame at the display rate the animator assumes, in ms. */
const FRAME_MS = 1000 / 60;

/**
 * The bounce ends where it is this close to rest, in px. This is the
 * animator's sample tolerance: a quarter of a CSS pixel, below what a moving
 * element can show.
 */
const REST_PX = 0.25;

/** As in the animator, a curve that has not settled by then stops, in ms. */
const MAX_DURATION_MS = 30_000;

/**
 * Bounces `dock` down and back to rest on the keyboard's spring, once. It
 * starts at the finger's speed, so it never moves faster than the finger, and
 * goes no deeper than `maxDepth` px. Under Reduce Motion, the person's setting
 * or a theme's mark, nothing moves.
 */
export function bounceComposer(
  dock: HTMLElement,
  fingerSpeed: number,
  maxDepth: number,
): void {
  // The bounce follows a touch drag's release; under Reduce Motion it is no
  // change to fade, so nothing plays.
  if (
    typeof dock.animate !== 'function' ||
    reducedMotionFade(dock, {touchRelease: true}) != null
  ) {
    return;
  }
  const spring = toSpring(resolveMotion(dock, springs.keyboard));
  // The depth a start at 1 px/s reaches, where the curve first turns back: a
  // faster start scales the whole curve.
  const unit = solveSpring(spring, {from: 0, to: 0, velocity: 1});
  let after = FRAME_MS / 1000;
  while (unit.velocity(after) > 0 && after < MAX_DURATION_MS / 1000) {
    after += FRAME_MS / 1000;
  }
  let before = Math.max(0, after - FRAME_MS / 1000);
  // Halve the frame around the turn until it is far below a frame.
  for (let step = 0; step < 32; step++) {
    const middle = (before + after) / 2;
    if (unit.velocity(middle) > 0) {
      before = middle;
    } else {
      after = middle;
    }
  }
  const unitDepth = unit.value(after);
  const speed = Math.min(fingerSpeed, unitDepth > 0 ? maxDepth / unitDepth : 0);
  if (!(speed > 0)) {
    return;
  }
  const curve = solveSpring(spring, {from: 0, to: 0, velocity: speed});
  const duration = Math.min(curve.settleTime(REST_PX) * 1000, MAX_DURATION_MS);
  if (!(duration > 0)) {
    return;
  }
  const count = Math.ceil(duration / FRAME_MS);
  const keyframes: Keyframe[] = [];
  for (let i = 0; i <= count; i++) {
    const offset = i / count;
    const y = i === count ? 0 : curve.value((offset * duration) / 1000);
    keyframes.push({offset, translate: `0 ${y}px`});
  }
  dock.animate(keyframes, {duration, easing: 'linear'});
}
