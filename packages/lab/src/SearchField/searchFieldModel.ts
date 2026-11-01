// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file searchFieldModel.ts
 * @input The UIKit search table and core's cubic-bézier curves (`search`,
 *   `timing` and `cubicBezier` from `@astryxdesign/core/internal/motion`)
 * @output Pure math for SearchField: the active field's width, the targets
 *   of every animated part at rest and while active, and the timed curves
 *   that move them (a UIViewPropertyAnimator's cubic-bézier clock, started
 *   from wherever a part is)
 * @position Model behind lab SearchField (SearchField.tsx); no DOM, no React
 *
 * UIKit activates a search bar on one UIViewPropertyAnimator (0.383 s,
 * cubic-bézier 0.42, 0, 0.58, 1): the field rises by the host's lift and
 * narrows to make room for the glass close button, which slides in from 44
 * pt past its place while it fades in. Cancel runs the same clock back to
 * rest, the close button sliding out at the opacity it has. A change of
 * mind mid-flight adds the turn to the curves on screen, on the whole clock,
 * as UIKit's animations do (the animator's `additive`).
 * The curve is the `timing.curves.move` motion role (`spec:AST-094` FR4); the
 * clock is the search table's internal constant, which moves to a role if the
 * record names one. No theme retunes either (DEC-11).
 *
 * The bottom (toolbar) placement moves differently: SwiftUI changes the
 * field's frame every frame with no animation object, so its swell and
 * narrowing are the measured frames themselves (`search.bottom.*Frames`),
 * played back as curves. Above the software keyboard it is placed by layout
 * (`bottomLift`), committed at once on each keyboard report: a Lab surface
 * never rides the keyboard (spec:AST-099 FR8).
 *
 * SYNC: When modified, update searchFieldModel.test.ts and SearchField.tsx.
 */

import {
  cubicBezier,
  type MotionCurve,
  timing,
} from '@astryxdesign/core/internal/motion';
import {search} from '../internal/searchMotion';

const {bottom} = search;

/**
 * The activation's curve, UIKit's ease-in-ease-out (the `timing.curves.move`
 * role), as a function of the clock's fraction.
 */
export const activationEase = cubicBezier(timing.curves.move);

/** The activation's length, s. */
export const ACTIVATION_S = search.activationMs / 1000;

/** An activation's clock and curve. */
export interface ActivationTiming {
  /** The full activation's length, s. */
  readonly seconds: number;
  /** The curve, as a function of the clock's fraction. */
  readonly ease: (x: number) => number;
}

/** The activation's clock and curve: UIKit's 383 ms ease-in-ease-out. */
export function activationTiming(): ActivationTiming {
  return {seconds: ACTIVATION_S, ease: activationEase};
}

/**
 * The active field's width beside the close button, from its resting width
 * (both px): the field gives up the close button and the gap before it.
 */
export function activeFieldWidth(restWidth: number): number {
  return Math.max(
    0,
    restWidth - search.stacked.closeGap - search.stacked.closeSize,
  );
}

/** Values of the animated parts at one end of the activation. */
export interface SearchFieldPose {
  /** The whole field's rise, px (negative is up). */
  y: number;
  /** The field background's stretchable middle, as a fraction of its width. */
  middleScale: number;
  /** The field's trailing end (its end cap and clear button), px. */
  endX: number;
  /** The close button's offset from its place, px. */
  closeX: number;
  /** The close button's opacity. */
  closeOpacity: number;
}

export interface SearchFieldGeometry {
  /** The field's resting width, px. */
  restWidth: number;
  /** The field's height, px: its rounded ends are half of it each. */
  height: number;
  /** How far the host lifts the active field, px (0: it stays put). */
  lift: number;
  /** Right-to-left: the trailing end is on the left. */
  isRtl: boolean;
}

/** Where each part rests while inactive (`isActive` false) or active. */
export function poseFor(
  isActive: boolean,
  {restWidth, height, lift, isRtl}: SearchFieldGeometry,
): SearchFieldPose {
  const direction = isRtl ? -1 : 1;
  if (!isActive) {
    return {
      y: 0,
      middleScale: 1,
      endX: 0,
      closeX: direction * search.stacked.closeTravel,
      closeOpacity: 0,
    };
  }
  const activeWidth = activeFieldWidth(restWidth);
  const middle = Math.max(1, restWidth - height);
  return {
    y: -lift,
    middleScale: Math.max(0, activeWidth - height) / middle,
    endX: -direction * (restWidth - activeWidth),
    closeX: 0,
    closeOpacity: 1,
  };
}

/**
 * A timed move from `from` to `to` on the activation curve (or `ease`) over
 * `duration` seconds, as a curve the animator plays.
 */
export function easedCurve(
  from: number,
  to: number,
  duration: number,
  ease: (x: number) => number = activationEase,
): MotionCurve {
  const delta = to - from;
  const step = 1e-4;
  return {
    duration,
    at(t) {
      if (duration <= 0) {
        return to;
      }
      return from + delta * ease(Math.min(1, Math.max(0, t / duration)));
    },
    velocity(t) {
      if (duration <= 0 || delta === 0) {
        return 0;
      }
      const x = Math.min(1, Math.max(0, t / duration));
      const lo = Math.max(0, x - step);
      const hi = Math.min(1, x + step);
      return (delta * (ease(hi) - ease(lo))) / (hi - lo) / duration;
    },
  };
}

/**
 * Holds `from` for `duration` seconds, then is `to`: how the close button's
 * opacity ends a cancel (it slides out at the opacity it has and is removed
 * at the end).
 */
export function heldCurve(
  from: number,
  to: number,
  duration: number,
): MotionCurve {
  return {
    duration,
    at: t => (t >= duration ? to : from),
    velocity: () => 0,
  };
}

/** A frame table: rows of [ms, ...values]. */
export type FrameTable = readonly (readonly number[])[];

/**
 * A curve through measured frames: linear between rows, held at both ends.
 * `value` reads one row (already mapped to the property's unit).
 */
export function framesCurve(
  frames: FrameTable,
  value: (row: readonly number[]) => number,
): MotionCurve {
  const last = frames[frames.length - 1];
  const duration = last[0] / 1000;
  const at = (t: number): number => {
    const ms = t * 1000;
    if (ms <= frames[0][0]) {
      return value(frames[0]);
    }
    if (ms >= last[0]) {
      return value(last);
    }
    let i = 1;
    while (frames[i][0] < ms) {
      i++;
    }
    const a = frames[i - 1];
    const b = frames[i];
    const f = (ms - a[0]) / (b[0] - a[0]);
    return value(a) + (value(b) - value(a)) * f;
  };
  return {
    duration,
    at,
    velocity(t) {
      const h = 0.001;
      return (
        (at(t + h) - at(Math.max(0, t - h))) / (t + h - Math.max(0, t - h))
      );
    },
  };
}

/** The bottom field's edges, px from the root's leading edge. */
export interface BottomEdges {
  restLeading: number;
  restTrailing: number;
  activeLeading: number;
  activeTrailing: number;
}

/** Where the bottom field's edges rest and go, in a root `width` px wide. */
export function bottomEdges(width: number): BottomEdges {
  return {
    restLeading: bottom.restInset,
    restTrailing: width - bottom.restInset,
    activeLeading: bottom.activeInset,
    activeTrailing:
      width - bottom.activeInset - bottom.closeSize - bottom.closeGap,
  };
}

/** One frame of the bottom field, in px and plain numbers. */
export interface BottomPose {
  /** The field's leading edge, px from the root's leading edge. */
  leading: number;
  /** The field's trailing edge, px from the root's leading edge. */
  trailing: number;
  /** The background's height as a fraction of its resting height. */
  heightScale: number;
  /** The close button's offset from its place, px toward the trailing end. */
  closeX: number;
  /** The close button's scale. */
  closeScale: number;
  /** The close button's opacity. */
  closeOpacity: number;
}

/** A row of a field gel table ([ms, leading, trailing, height]) as px. */
export function bottomFieldAt(
  row: readonly number[],
  edges: BottomEdges,
): Pick<BottomPose, 'leading' | 'trailing' | 'heightScale'> {
  return {
    leading:
      edges.restLeading + row[1] * (edges.activeLeading - edges.restLeading),
    trailing:
      edges.restTrailing + row[2] * (edges.activeTrailing - edges.restTrailing),
    heightScale: row[3],
  };
}

/** The bottom field settled inactive or active. */
export function bottomPoseFor(isActive: boolean, width: number): BottomPose {
  const edges = bottomEdges(width);
  const enter = bottom.closeEnterFrames;
  const hidden = enter[0];
  return isActive
    ? {
        leading: edges.activeLeading,
        trailing: edges.activeTrailing,
        heightScale: 1,
        closeX: 0,
        closeScale: 1,
        closeOpacity: 1,
      }
    : {
        leading: edges.restLeading,
        trailing: edges.restTrailing,
        heightScale: 1,
        closeX: hidden[3],
        closeScale: hidden[2],
        closeOpacity: 0,
      };
}

/** The curves that play the bottom field's activation or cancel. */
export interface BottomMotion {
  leading: MotionCurve;
  trailing: MotionCurve;
  heightScale: MotionCurve;
  closeX: MotionCurve;
  closeScale: MotionCurve;
  closeOpacity: MotionCurve;
}

/**
 * The bottom field's activation (`isActive` true) or cancel as measured
 * curves, in a root `width` px wide.
 */
export function bottomMotion(isActive: boolean, width: number): BottomMotion {
  const edges = bottomEdges(width);
  const field = isActive ? bottom.activationFrames : bottom.cancelFrames;
  const hold = (value: number): MotionCurve => ({
    duration: 0,
    at: () => value,
    velocity: () => 0,
  });
  if (isActive) {
    const enter = bottom.closeEnterFrames;
    return {
      leading: framesCurve(field, row => bottomFieldAt(row, edges).leading),
      trailing: framesCurve(field, row => bottomFieldAt(row, edges).trailing),
      heightScale: framesCurve(field, row => row[3]),
      closeX: framesCurve(enter, row => row[3]),
      closeScale: framesCurve(enter, row => row[2]),
      closeOpacity: framesCurve(enter, row => row[1]),
    };
  }
  const exit = bottom.closeExitFrames;
  return {
    leading: framesCurve(field, row => bottomFieldAt(row, edges).leading),
    trailing: framesCurve(field, row => bottomFieldAt(row, edges).trailing),
    heightScale: framesCurve(field, row => row[3]),
    closeX: hold(-bottom.cancelNarrowing),
    closeScale: framesCurve(exit, row => row[2]),
    closeOpacity: framesCurve(exit, row => row[1]),
  };
}

/**
 * A change of mind mid-move: eased curves from the pose the field is in to
 * its settled pose for `isActive`, on the activation's whole clock
 * (`seconds`, `ease`). SearchField plays them added to the curves on screen
 * (the animator's `additive`), as UIKit's animations add: the measured frame
 * tables start from a settled field, so replaying one would snap the field
 * there first.
 */
export function bottomRedirect(
  from: BottomPose,
  isActive: boolean,
  width: number,
  seconds: number,
  ease: (x: number) => number,
): BottomMotion {
  const to = bottomPoseFor(isActive, width);
  const curve = (key: keyof BottomPose) =>
    easedCurve(from[key], to[key], seconds, ease);
  return {
    leading: curve('leading'),
    trailing: curve('trailing'),
    heightScale: curve('heightScale'),
    closeX: curve('closeX'),
    closeScale: curve('closeScale'),
    closeOpacity: curve('closeOpacity'),
  };
}

/**
 * How far the bottom field sits above its resting place for a keyboard
 * `inset`, px (positive is up; layout, the root's `bottom`): while active,
 * with the keyboard up, its centre stays `keyboardCenterOffset` above the
 * keyboard's top; otherwise the bar keeps its resting gap above the keyboard
 * (0 with the keyboard down). `restGap` is how far the field's resting
 * centre sits above the viewport's bottom edge.
 */
export function bottomLift(
  isActive: boolean,
  inset: number,
  restGap: number,
): number {
  return isActive && inset > 0
    ? inset + bottom.keyboardCenterOffset - restGap
    : inset;
}
