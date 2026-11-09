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
import {cubicBezier} from '../motion/bezier';
import type {KeyboardTransition} from './keyboardModel';

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
 * (motion/android/keyboard.ts). The transition publishes the slide
 * (`curve`), and the ride plays it. Every ride starts at the transition's
 * start, so content that joins a slide late lands where the keyboard is. A
 * transition that is not animated lands at once, such as a keyboard changing
 * while up. So does a slide that has ended by the call. These values are the
 * keyboard's own motion, with no motion role. The system moves the keyboard
 * on them whatever the page does, so any other curve would leave the element
 * out of step.
 *
 * @example
 * ```
 * guide.subscribe(t => rideKeyboard(dock.animator, {y: -lift(t.to)}, t));
 * ```
 */
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
  // Under Reduce Motion nothing travels. The animator's default cross-fades
  // the element to its new place on a touch screen, and elsewhere moves it at
  // once. An entrance lands it at once and fades it in.
  const options = entrance
    ? {at: transition.start, crossfadeAs: 'entrance' as const}
    : {at: transition.start};
  const span = transition.curve.durationMs / 1000;
  const ease = cubicBezier(transition.curve.points);
  const curves: Partial<Record<MotionProperty, MotionCurve>> = {};
  for (const [property, target] of Object.entries(to) as [
    MotionProperty,
    number,
  ][]) {
    const from = animator.get(property, transition.start);
    const at = (t: number) =>
      from + (target - from) * ease(Math.min(1, Math.max(0, t / span)));
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
