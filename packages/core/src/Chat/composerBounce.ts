// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file composerBounce.ts
 * @input The keyboard's spring as a motion role, the spring solver, Core's
 *   Reduced Motion policy, a finger's speed and how deep the bounce may go
 * @output composerBounce: the spring and start speed of one small bounce of
 *   the composer's dock
 * @position Internal to Chat. useChatKeyboard plays it on the dock's motion
 *   engine as a drag dismisses the keyboard. So the composer, the frosted
 *   layer and the scroll-to-bottom button move as one.
 */

import {reducedMotionFade} from '../motion/reducedMotion';
import {resolveMotion} from '../motion/resolveMotion';
import {solveSpring, toSpring, type SpringDescription} from '../motion/spring';
import {springs} from '../motion/uikit/springs';

/** One bounce: a spring back to where it starts, from a start speed. */
export interface ComposerBounce {
  readonly spring: SpringDescription;
  /** The start speed down the screen, px/s. */
  readonly speed: number;
}

/**
 * One bounce of `dock` down and back to rest on the keyboard's spring. It
 * starts at the finger's speed, so it never moves faster than the finger, and
 * goes no deeper than `maxDepth` px. Null where nothing moves: under Reduce
 * Motion, the person's setting or a theme's mark, for a finger at rest, or
 * with no depth to go.
 */
export function composerBounce(
  dock: HTMLElement,
  fingerSpeed: number,
  maxDepth: number,
): ComposerBounce | null {
  // The bounce follows a touch drag; under Reduce Motion it is no change to
  // fade, so nothing plays.
  if (reducedMotionFade(dock, {touchRelease: true}) != null) {
    return null;
  }
  const spring = resolveMotion(dock, springs.keyboard);
  // The depth a start at 1 px/s reaches, where the curve first turns back: a
  // faster start scales the whole curve.
  const unit = solveSpring(toSpring(spring), {from: 0, to: 0, velocity: 1});
  const unitDepth = unit.value(turnTime(unit.velocity));
  const speed = Math.min(fingerSpeed, unitDepth > 0 ? maxDepth / unitDepth : 0);
  return speed > 0 ? {spring, speed} : null;
}

/**
 * When a curve that starts moving forward first turns back, s. Its velocity
 * changes sign once, so the time doubles until it does, then halves the
 * bracket around it.
 */
function turnTime(velocity: (t: number) => number): number {
  let after = 1 / 1024;
  while (velocity(after) > 0 && after < 60) {
    after *= 2;
  }
  let before = 0;
  for (let step = 0; step < 48; step++) {
    const middle = (before + after) / 2;
    if (velocity(middle) > 0) {
      before = middle;
    } else {
      after = middle;
    }
  }
  return after;
}
