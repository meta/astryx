// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file rideKeyboard.ts
 * @input An animator, target values and a keyboard transition, with its
 *   start and the curve the guide publishes with it, and ride options
 * @output rideKeyboard, which moves an element with the keyboard on the
 *   keyboard's own motion
 * @position Keyboard module, internal to core. A guide subscriber calls it
 *   for each transition, as BottomSheet's hook does.
 *
 * SYNC: When modified, update /packages/core/src/keyboard/README.md
 */

import type {
  Animator,
  MotionCurve,
  MotionHandle,
  MotionProperty,
  MotionValues,
} from '../motion/animator';
import {keyboardProgress, type KeyboardTransition} from './keyboardModel';

/** How a ride treats Reduce Motion. */
export interface RideOptions {
  /**
   * Under Reduce Motion, lands the element at once and fades it in. Without
   * it, the animator's own Reduce Motion plan applies.
   */
  readonly entrance?: boolean;
}

/**
 * Moves `animator`'s element to `to` with the keyboard: on its curve from
 * `transition.start`, or at once when the keyboard jumps.
 *
 * Android's keyboard moves on Gboard's slides up and down
 * (motion/android/keyboard.ts), and iOS's on UIKit's keyboard spring
 * (motion/uikit/springs.ts, as keyboard/uikitKeyboardSchedule.ts cuts it).
 * The transition publishes the curve (`curve`), and the ride plays it. Every
 * ride starts at the transition's start, so content that joins a slide late
 * lands where the keyboard is. A transition that is not animated lands at
 * once, such as a keyboard changing while up. So does a slide that has ended
 * by the call. These values are the keyboard's own motion, with no motion
 * role. The system moves the keyboard on them whatever the page does, so any
 * other curve would leave the element out of step.
 *
 * @example
 * ```
 * guide.subscribe(t => rideKeyboard(dock.animator, {y: -lift(t.to)}, t));
 * ```
 */
// The document timeline's time, the time of the frame in progress.
function timelineTime(): number | null {
  const time =
    typeof document === 'undefined' ? null : document.timeline?.currentTime;
  return typeof time === 'number' ? time : null;
}

export function rideKeyboard(
  animator: Animator,
  to: MotionValues,
  transition: KeyboardTransition,
  {entrance = false}: RideOptions = {},
): MotionHandle | null {
  // A frame after a busy task still draws an animation at that task's
  // start. The ride sets a slide that has already ended, so no frame shows the
  // element short of its target.
  if (
    !transition.animated ||
    transition.curve == null ||
    performance.now() >= transition.start + transition.curve.durationMs
  ) {
    animator.set(to);
    return null;
  }
  // Safari can date the event that reports the keyboard a little after the
  // frame that dispatches it. A ride dated after that frame waits in its
  // before phase there, and a block right after the frame then stops it. So
  // a reported ride starts no later than the document timeline's time. A
  // predicted hide after a blur starts ahead on purpose, and keeps its start.
  const start = transition.predicted
    ? transition.start
    : Math.min(transition.start, timelineTime() ?? transition.start);
  // Under Reduce Motion nothing travels. The animator's default cross-fades
  // the element to its new place on a touch screen, and elsewhere moves it at
  // once. An entrance lands it at once and fades it in.
  const options = entrance
    ? {at: start, crossfadeAs: 'entrance' as const}
    : {at: start};
  const span = transition.curve.durationMs / 1000;
  const progress = keyboardProgress(transition.curve);
  const curves: Partial<Record<MotionProperty, MotionCurve>> = {};
  for (const [property, target] of Object.entries(to) as [
    MotionProperty,
    number,
  ][]) {
    const from = animator.get(property, start);
    const at = (t: number) => from + (target - from) * progress(t);
    curves[property] = {
      duration: span,
      at,
      velocity: t => {
        if (t >= span) {
          return 0;
        }
        const a = Math.max(0, t - 0.001);
        const b = Math.min(span, t + 0.001);
        return (at(b) - at(a)) / (b - a);
      },
    };
  }
  return animator.play(curves, options);
}
