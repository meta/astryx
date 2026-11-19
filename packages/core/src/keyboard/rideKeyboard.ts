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

// A surface's progress, 0 to 1, on a curve that rides the inset's edge. The
// edge travels `edge` px and the surface `own` px. A surface that travels as
// far as the edge, or farther, rides the whole curve. On a show, the edge
// reaches a shorter traveller once it has risen the difference, and then
// pushes it. On a hide, the edge lets it down until it comes to rest.
function edgeProgress(
  progress: (t: number) => number,
  edge: number,
  own: number,
  rising: boolean,
): (t: number) => number {
  if (own <= 0 || own >= edge) {
    return progress;
  }
  const wait = rising ? edge - own : 0;
  return t => Math.min(1, Math.max(0, (edge * progress(t) - wait) / own));
}

/** How a ride treats Reduce Motion. */
export interface RideOptions {
  /**
   * Under Reduce Motion, lands the element at once and fades it in. Without
   * it, the animator's own Reduce Motion plan applies.
   */
  readonly entrance?: boolean;
}

// The document timeline's time, the time of the frame in progress.
function timelineTime(): number | null {
  const time =
    typeof document === 'undefined' ? null : document.timeline?.currentTime;
  return typeof time === 'number' ? time : null;
}

/**
 * Moves `animator`'s element to `to` with the keyboard: on its curve from
 * `transition.start`, or at once when the keyboard jumps.
 *
 * Android's keyboard moves on Gboard's slides up and down
 * (motion/android/keyboard.ts). In Safari on iOS, a show rides a spring that
 * leads UIKit's keyboard spring, and a hide rides UIKit's keyboard spring
 * (motion/uikit/springs.ts), as keyboard/uikitKeyboardSchedule.ts sets them.
 * There each surface rides the inset's edge: it moves only while the edge is
 * at it (`followsEdge`). Elsewhere it moves over its own travel along the
 * whole curve. The transition publishes the curve (`curve`), and the ride
 * plays it. Every
 * ride starts at the transition's start, so content that joins a slide late
 * lands where the keyboard is. A transition that is not animated lands at
 * once, such as a keyboard changing while up. So does a slide that has ended
 * by the call. These values follow the keyboard, with no motion role. The
 * system moves the keyboard whatever the page does, so a curve that does not
 * follow it would leave the element out of step.
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
  // Safari can date the event that reports the keyboard a little after the
  // frame that dispatches it. A ride dated after that frame has not started
  // there. A long task right after the frame then holds it. So a reported
  // ride starts no later than the document timeline's time. A predicted hide
  // after a blur starts ahead on purpose, and keeps its start.
  const start = transition.predicted
    ? transition.start
    : Math.min(transition.start, timelineTime() ?? transition.start);
  // A ride that starts before the report's time holds the element still until
  // that time. So the element starts to move at the report.
  const hold = (transition.start - start) / 1000;
  // Under Reduce Motion nothing travels. The animator's default cross-fades
  // the element to its new place on a touch screen, and elsewhere moves it at
  // once. An entrance lands it at once and fades it in.
  const options = entrance
    ? {at: start, crossfadeAs: 'entrance' as const}
    : {at: start};
  const {curve} = transition;
  const duration = curve.durationMs / 1000 + hold;
  const progress = keyboardProgress(curve);
  const followsEdge = 'followsEdge' in curve && curve.followsEdge === true;
  const edge = Math.abs(transition.to - transition.from);
  const rising = transition.to > transition.from;
  const curves: Partial<Record<MotionProperty, MotionCurve>> = {};
  for (const [property, target] of Object.entries(to) as [
    MotionProperty,
    number,
  ][]) {
    const from = animator.get(property, start);
    const own = followsEdge
      ? edgeProgress(progress, edge, Math.abs(target - from), rising)
      : progress;
    const at = (t: number) =>
      from + (target - from) * own(Math.max(0, t - hold));
    curves[property] = {
      duration,
      at,
      velocity: t => {
        if (t >= duration) {
          return 0;
        }
        const a = Math.max(0, t - 0.001);
        const b = Math.min(duration, t + 0.001);
        return (at(b) - at(a)) / (b - a);
      },
    };
  }
  return animator.play(curves, options);
}
