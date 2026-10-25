// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file contextMenuPressCurve.ts
 * @input The context-menu constants (motion roles a theme may retune) and
 *   the motion foundation's spring toward a moving target
 * @output Exports pressFeedbackTarget (the size UIKit asks the press copy for
 *   at a moment of the press), PRESS_FEEDBACK_START_MS, pressFeedbackMotion
 *   (the feedback's spring, onset and latency under an element's theme) and
 *   pressFeedbackCurve (the size it shows, as a PressFeedbackCurve the
 *   compositor animator plays)
 * @position The press feedback's curve, for ContextMenu's touch invocation
 *
 * On iOS 26.2 a finger resting on a view with a context menu makes a copy of
 * the view grow from its center: UIKit asks for a size that ramps linearly
 * (`contextMenu.press.feedbackRate` from the onset, a slower
 * `feedbackRateAfterCommit` after the commit, until the menu displays), and
 * the copy's visible size chases that ramp through a spring
 * (`feedbackSpring`), shown `feedbackLatencyMs` after UIKit starts it. These
 * are pure functions of the constants; the curve is closed-form, so the whole
 * held press can be computed when the finger lands and played on the
 * compositor. The spring, the onset and the latency are motion roles: a
 * theme can retune them (`pressFeedbackMotion` reads them for an element).
 * The commit and the menu's moment decide who gets the touch, so they are
 * not.
 *
 * SYNC: When modified, update
 * /packages/core/src/ContextMenu/contextMenuPressCurve.test.ts
 */

import {
  settlingDuration,
  solveSpringTowardRamp,
  toSpring,
  type SpringDescription,
  type SpringRampCurve,
} from '../motion/spring';
import {resolveMotion} from '../motion/resolveMotion';
import {contextMenu} from '../motion/uikit/contextMenu';

const {
  feedbackOnsetMs,
  commitMs,
  menuDisplayMs,
  feedbackRate,
  feedbackRateAfterCommit,
  feedbackSpring,
  feedbackLatencyMs,
} = contextMenu.press;

/** The press feedback's motion: its spring, onset and display latency. */
export interface PressFeedbackMotion {
  readonly spring: SpringDescription;
  readonly onsetMs: number;
  readonly latencyMs: number;
}

/** The table's motion (UIKit's), when no theme retunes it. */
const TABLE_MOTION: PressFeedbackMotion = {
  spring: feedbackSpring,
  onsetMs: feedbackOnsetMs,
  latencyMs: feedbackLatencyMs,
};

/**
 * The press feedback's motion under `element`'s theme: the spring and the
 * latency are roles a theme sets with `defineTheme({motion})`, or the
 * table's. The onset is not a role: core's press machine decides when a press
 * is believed, so the curve keeps the measured onset it starts from.
 */
export function pressFeedbackMotion(
  element: Element | null | undefined,
): PressFeedbackMotion {
  return {
    spring: resolveMotion(element, contextMenu.press.feedbackSpring),
    onsetMs: feedbackOnsetMs,
    latencyMs: resolveMotion(element, contextMenu.press, 'feedbackLatencyMs'),
  };
}

/**
 * The scale UIKit asks the press copy for, `t` ms after the finger landed:
 * 1 until the onset, then the first ramp, then (continuously) the second one
 * until the menu displays, where it stops.
 */
export function pressFeedbackTarget(
  t: number,
  onsetMs: number = feedbackOnsetMs,
): number {
  if (t <= onsetMs) {
    return 1;
  }
  const atCommit = 1 + (feedbackRate * Math.max(commitMs - onsetMs, 0)) / 1000;
  if (t <= commitMs) {
    return 1 + (feedbackRate * (t - onsetMs)) / 1000;
  }
  return (
    atCommit +
    (feedbackRateAfterCommit * (Math.min(t, menuDisplayMs) - commitMs)) / 1000
  );
}

/**
 * A closed-form curve over `duration` seconds: t is seconds from its start,
 * the value at `duration` its end state. The shape the compositor animator
 * plays (`animator.play`).
 */
export interface PressFeedbackCurve {
  readonly duration: number;
  at(t: number): number;
  /** Units per second. */
  velocity(t: number): number;
}

/** When the visible curve starts, ms after the finger landed. */
export const PRESS_FEEDBACK_START_MS = feedbackOnsetMs + feedbackLatencyMs;

/**
 * The scale the press copy shows from `PRESS_FEEDBACK_START_MS` on (t in
 * seconds from there), for a finger that stays: the feedback spring chasing
 * `pressFeedbackTarget` as the screen shows it (`feedbackLatencyMs` late),
 * chained piece by piece where the ramp changes, then settling on the last
 * size. It starts from rest at 1 unless the view is still moving from an
 * earlier press.
 */
export function pressFeedbackCurve({
  from = 1,
  velocity = 0,
  motion = TABLE_MOTION,
}: {
  from?: number;
  velocity?: number;
  /** A theme's motion (`pressFeedbackMotion`); the table's by default. */
  motion?: PressFeedbackMotion;
} = {}): PressFeedbackCurve {
  const {onsetMs} = motion;
  const spring = toSpring(motion.spring);
  const commit = Math.max(commitMs - onsetMs, 0) / 1000;
  const display = Math.max(menuDisplayMs - onsetMs, 0) / 1000;
  const first = solveSpringTowardRamp(spring, {
    from,
    velocity,
    target: 1,
    slope: feedbackRate,
  });
  const second = solveSpringTowardRamp(spring, {
    from: first.value(commit),
    velocity: first.velocity(commit),
    target: pressFeedbackTarget(commitMs, onsetMs),
    slope: feedbackRateAfterCommit,
  });
  const secondLength = display - commit;
  const last = solveSpringTowardRamp(spring, {
    from: second.value(secondLength),
    velocity: second.velocity(secondLength),
    target: pressFeedbackTarget(menuDisplayMs, onsetMs),
    slope: 0,
  });
  const settle = settlingDuration(spring, {epsilon: 1e-4});
  const pieces: ReadonlyArray<[start: number, curve: SpringRampCurve]> = [
    [0, first],
    [commit, second],
    [display, last],
  ];
  const pieceAt = (t: number): [number, SpringRampCurve] => {
    for (let i = pieces.length - 1; i > 0; i--) {
      if (t >= pieces[i][0]) {
        return pieces[i];
      }
    }
    return pieces[0];
  };
  return {
    duration: display + settle,
    at: t => {
      const [start, curve] = pieceAt(t);
      return curve.value(t - start);
    },
    velocity: t => {
      const [start, curve] = pieceAt(t);
      return curve.velocity(t - start);
    },
  };
}
