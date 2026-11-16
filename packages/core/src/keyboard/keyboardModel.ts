// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file keyboardModel.ts
 * @input `keyboard` from the Android table: Gboard's slides and Chrome's
 *   report timings. A schedule the caller passes, as the touch runtime's UIKit
 *   schedule (uikitKeyboardSchedule.ts)
 * @output createKeyboardModel, the keyboard layout guide's clock-free core,
 *   and the KeyboardTransition and KeyboardModel types
 * @position The state of the keyboard layout guide (keyboardLayoutGuide.ts).
 *   It infers the keyboard's transition from the visual viewport's reports
 *   and focus changes, each input with its own time. It is internal to core.
 *
 * SYNC: When modified, update /packages/core/src/keyboard/README.md
 */

import {keyboard as androidKeyboard} from '../motion/android/keyboard';
import {cubicBezier} from '../motion/bezier';

/**
 * Which keyboard's reports the guide reads: Gboard's in Chrome, or UIKit's in
 * Safari on iOS.
 */
export type KeyboardProfile = 'chromium' | 'uikit';

/** An eased slide: Gboard going up or down. */
export interface KeyboardSlideCurve {
  /** Length, ms. */
  readonly durationMs: number;
  /** Cubic-bézier control points. */
  readonly points: readonly [number, number, number, number];
}

/**
 * A curve with its own progress: UIKit's keyboard spring, cut at
 * `durationMs` (uikitKeyboardSchedule.ts).
 */
export interface KeyboardProgressCurve {
  /** Length, ms. The motion lands on its target here. */
  readonly durationMs: number;
  /** How far along the curve the keyboard is, 0 to 1, `t` seconds in. */
  readonly progress: (t: number) => number;
}

/** The curve a transition plays. */
export type KeyboardCurve = KeyboardSlideCurve | KeyboardProgressCurve;

/**
 * How far along `curve` the keyboard is, from 0 to 1, `t` seconds after the
 * transition's start.
 */
export function keyboardProgress(curve: KeyboardCurve): (t: number) => number {
  if ('progress' in curve) {
    return curve.progress;
  }
  const span = curve.durationMs / 1000;
  const ease = cubicBezier(curve.points);
  return t => ease(Math.min(1, Math.max(0, t / span)));
}

/** How the keyboard's cover changes. */
export type KeyboardTransitionKind = 'show' | 'hide' | 'change';

/** One change of the keyboard's cover, as the guide reports it. */
export interface KeyboardTransition {
  readonly kind: KeyboardTransitionKind;
  /** Inset presented at `start`, CSS px. */
  readonly from: number;
  /** Inset the keyboard comes to rest at, CSS px. */
  readonly to: number;
  /**
   * When the keyboard starts to move, ms on the document timeline
   * (`performance.now()`). For a slide Chrome reported, the guide dates it
   * back to Gboard's start. For a hide after a blur, it is shortly ahead.
   */
  readonly start: number;
  /** The inset's velocity at `start`, px/s (0 unless it interrupts one). */
  readonly velocity: number;
  /** False when the inset jumps at `start` (another keyboard while one is up). */
  readonly animated: boolean;
  /** True until the visual viewport confirms a transition the guide inferred. */
  readonly predicted: boolean;
  /**
   * The curve the keyboard moves on, or null when the inset jumps. It is
   * Gboard's slide in Chrome on Android, and UIKit's keyboard spring in Safari
   * on iOS. A surface riding the keyboard plays it from `start`, as
   * rideKeyboard does.
   * It is the keyboard's own motion, with no motion role.
   */
  readonly curve: KeyboardCurve | null;
}

/** The guide's clock-free core: inputs carry their own times. */
export interface KeyboardModel {
  /** The inset the keyboard rests at (or is heading to), CSS px. */
  readonly inset: number;
  /** The latest transition. */
  readonly transition: KeyboardTransition;
  /** The inset presented at `time`, CSS px. */
  presentation(time: number): number;
  /** The presented inset's velocity at `time`, px/s. */
  velocity(time: number): number;
  /**
   * The visual viewport reports an inset (null when unknown) at `time` (the
   * event's timestamp). Returns the transition the report starts, if any.
   */
  report(inset: number | null, time: number): KeyboardTransition | null;
  /**
   * A control that brings up a keyboard lost focus to nothing that brings
   * up one.
   */
  blurred(time: number): KeyboardTransition | null;
  /** A control that brings up a keyboard gained focus. */
  focused(time: number): KeyboardTransition | null;
  /**
   * Checks a predicted transition against the viewport once it should have
   * ended; moves to what the viewport says when they disagree.
   */
  verify(inset: number | null, time: number): KeyboardTransition | null;
}

const EPSILON = 0.5;

/** The inset and its velocity, seconds after a transition's start. */
interface InsetCurve {
  value(t: number): number;
  velocity(t: number): number;
}

/**
 * When a keyboard moves against its reports, in the Android table's shape:
 * one slide for the show and one for the hide.
 */
export interface KeyboardSlideSchedule {
  readonly showMs: number;
  readonly showCurve: readonly [number, number, number, number];
  readonly hideMs: number;
  readonly hideCurve: readonly [number, number, number, number];
  /** How long before its report the show starts, ms. */
  readonly showReportLagMs: number;
  /** How long before its report a hide nothing predicted starts, ms. */
  readonly hideReportLagMs: number;
  /** How long after a blur the keyboard starts down, ms. */
  readonly hideAfterBlurMs: number;
}

/**
 * A keyboard that moves on one curve, show and hide alike. It reports its
 * height once, accessory bar included, as UIKit's does in Safari on iOS.
 */
export interface KeyboardCurveSchedule {
  readonly curve: KeyboardProgressCurve;
  readonly showReportLagMs: number;
  readonly hideReportLagMs: number;
  readonly hideAfterBlurMs: number;
}

/** When a keyboard moves against its reports, and on what curve. */
export type KeyboardSchedule = KeyboardSlideSchedule | KeyboardCurveSchedule;

/**
 * Creates the guide's core. Tests drive it with explicit times, and the
 * window's guide feeds it events.
 *
 * Chrome reports each keyboard slide through the visual viewport just after
 * it starts (README.md, "What the page sees"). Content rides Gboard's own
 * slides, fitted on Chromium 158 with Gboard (motion/android/keyboard.ts).
 *
 * - Show: from the report, dated back `androidKeyboard.showReportLagMs`, on
 *   `showCurve` over `showMs`, joining the slide where it is. The report's
 *   first painted frame trails Gboard's first moved frame by 14 to 35 ms. An
 *   `<input>` that brings an accessory bar first gives a smaller report
 *   before the keyboard's. It rides to the last keyboard's height instead, as
 *   a prediction, and the keyboard's report confirms it.
 * - Hide: on `hideCurve` over `hideMs`. It starts
 *   `androidKeyboard.hideAfterBlurMs` after a blur that brings no keyboard,
 *   as a prediction, because Gboard starts down at the blur. When nothing
 *   predicted it, as with Back, it starts from Chrome's report, dated back
 *   `hideReportLagMs`, the lag measured on blurs.
 * - A keyboard that changes while up, such as another keyboard, lays out at
 *   once.
 *
 * Another `schedule` sets other curves and timings, as the touch runtime's
 * schedule for Safari on iOS does (uikitKeyboardSchedule.ts).
 *
 * A prediction the viewport has not confirmed by its end gives way to what
 * the viewport says (`verify`).
 */
export function createKeyboardModel(
  initialInset = 0,
  schedule: KeyboardSchedule = androidKeyboard,
): KeyboardModel {
  let transition: KeyboardTransition = {
    kind: 'change',
    from: initialInset,
    to: initialInset,
    start: -Infinity,
    velocity: 0,
    animated: false,
    predicted: false,
    curve: null,
  };
  // The inset over seconds since the transition's start.
  let curve: InsetCurve | null = null;
  // A curve's value and velocity.
  const easedCurve = (
    from: number,
    to: number,
    slide: KeyboardCurve,
  ): InsetCurve => {
    const span = slide.durationMs / 1000;
    const progress = keyboardProgress(slide);
    const value = (t: number) => from + (to - from) * progress(t);
    return {
      value,
      velocity: (t: number) => {
        if (t >= span) {
          return 0;
        }
        const a = Math.max(0, t - 0.001);
        const b = Math.min(span, t + 0.001);
        return (value(b) - value(a)) / (b - a);
      },
    };
  };
  // Gboard's slides, as Chrome draws them, unless the schedule has one curve.
  const showSlide: KeyboardCurve =
    'curve' in schedule
      ? schedule.curve
      : {durationMs: schedule.showMs, points: schedule.showCurve};
  const hideSlide: KeyboardCurve =
    'curve' in schedule
      ? schedule.curve
      : {durationMs: schedule.hideMs, points: schedule.hideCurve};
  // How long the current transition moves for.
  const lengthOf = () =>
    transition.curve != null ? transition.curve.durationMs : 0;
  // The inset of the last keyboard that was up, for a hide that turns back.
  let shownInset = initialInset;

  const presentation = (time: number): number => {
    // A jump has happened at its start; a curve starts from `from`.
    if (time < transition.start) {
      return transition.from;
    }
    if (curve == null || time >= transition.start + lengthOf()) {
      return transition.to;
    }
    return curve.value((time - transition.start) / 1000);
  };
  const velocity = (time: number): number => {
    if (time <= transition.start) {
      return transition.velocity;
    }
    if (curve == null || time >= transition.start + lengthOf()) {
      return 0;
    }
    return curve.velocity((time - transition.start) / 1000);
  };

  const begin = (
    kind: KeyboardTransitionKind,
    to: number,
    start: number,
    {animated = true, predicted = false} = {},
  ): KeyboardTransition => {
    // Never date a transition before the one it interrupts.
    const at = Math.max(start, transition.start);
    const from = presentation(at);
    const v = animated ? velocity(at) : 0;
    const slide = animated ? (to > from ? showSlide : hideSlide) : null;
    transition = {
      kind,
      from,
      to,
      start: at,
      velocity: v,
      animated,
      predicted,
      curve: slide,
    };
    curve =
      slide != null && Math.abs(to - from) + Math.abs(v) > 0
        ? easedCurve(from, to, slide)
        : null;
    if (to > EPSILON) {
      shownInset = to;
    }
    return transition;
  };
  const confirm = (): null => {
    if (transition.predicted) {
      transition = {...transition, predicted: false};
    }
    return null;
  };

  return {
    get inset() {
      return transition.to;
    },
    get transition() {
      return transition;
    },
    presentation,
    velocity,
    report(inset, time) {
      if (inset == null) {
        return null;
      }
      const target = transition.to;
      if (Math.abs(inset - target) < EPSILON) {
        return confirm();
      }
      if (inset <= EPSILON) {
        // A hide nothing predicted, as Back in Chrome: Chrome reports it just
        // after Gboard starts down, so it rides from that moment. Safari
        // reports it once the keyboard is down, and the content rides from
        // the report.
        return begin('hide', 0, time - schedule.hideReportLagMs);
      }
      if (target <= EPSILON) {
        // Chrome reports the show just after Gboard starts up: ride from
        // that moment, joining the slide where it is. A smaller first
        // report is the accessory bar, the keyboard's own following: ride
        // to the last keyboard's height and let its report confirm it.
        const predicted =
          !('curve' in schedule) && shownInset > inset + EPSILON;
        return begin(
          'show',
          predicted ? shownInset : inset,
          time - schedule.showReportLagMs,
          {predicted},
        );
      }
      // The keyboard changed while up (another keyboard, or the keyboard's
      // report after the accessory bar's): Chrome lays the page out at once.
      return begin('change', inset, time, {animated: false});
    },
    blurred(time) {
      if (transition.to <= EPSILON) {
        return null;
      }
      return begin('hide', 0, time + schedule.hideAfterBlurMs, {
        predicted: true,
      });
    },
    focused(time) {
      if (transition.kind !== 'hide' || !transition.predicted) {
        return null;
      }
      // Focus came back before the predicted hide finished: the keyboard
      // turns back to the inset it had.
      return begin('show', shownInset, Math.max(time, transition.start), {
        predicted: true,
      });
    },
    verify(inset, time) {
      if (
        !transition.predicted ||
        inset == null ||
        time < transition.start + lengthOf()
      ) {
        return null;
      }
      if (Math.abs(inset - transition.to) < EPSILON) {
        return confirm();
      }
      return begin(inset > transition.to ? 'show' : 'hide', inset, time);
    },
  };
}
