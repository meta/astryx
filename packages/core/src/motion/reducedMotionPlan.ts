// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file reducedMotionPlan.ts
 * @input A call's targets and a read-only view of the animator's opacity
 *   state
 * @output planReducedMotion, TRAVEL_PROPERTIES and the plan's types
 * @position The animator's Reduce Motion planner (packages/core/src/motion):
 *   what one call becomes under Reduce Motion. animator.ts applies the plan;
 *   the policy itself is described in its header (design:reduced-motion
 *   DR1–DR4).
 *
 * With `fade` (a coarse primary pointer, or a touch drag's release), a call
 * becomes an opacity-only cross-fade whose travel lands while the element is
 * transparent: an entrance from 0 lands at once and fades in, an exit to 0
 * fades out in place and then lands, and any other call that moves dips
 * (fades out, lands, fades back in). Without `fade`, everything lands at once. When no call owns
 * the opacity, a dip or a fade by role starts from and returns to the
 * element's own (stylesheet) opacity, which the plan reports as `borrowed`.
 * The planner is pure: it reads the animator only through
 * `ReducedMotionView` and returns what to write.
 *
 * SYNC: When modified, update animator.ts (its header's Reduce Motion
 * section, and `reducedMotion`, which applies the plan) and animator.test.ts.
 */

import type {MotionProperty} from './animator';
import {reducedMotionCrossFade} from './uikit/timing';

/** The properties that move an element rather than fade it. */
export const TRAVEL_PROPERTIES: ReadonlyArray<MotionProperty> = [
  'x',
  'y',
  'rotate',
  'scaleX',
  'scaleY',
];

/** A point of the opacity fade: ms after the call's start, and the value. */
export interface FadePoint {
  readonly at: number;
  readonly value: number;
}

/** The travel a plan writes later, while the element is transparent. */
export interface PlannedLanding {
  /** ms after the call's start. */
  readonly at: number;
  readonly values: Map<MotionProperty, number>;
  /**
   * The fade back in that follows the landing (a dip); `isBorrowed` when it
   * returns to the stylesheet's opacity, which owns it again once it ends.
   */
  fadeIn: {
    readonly to: number;
    readonly ms: number;
    readonly isBorrowed?: boolean;
  } | null;
  /** The opacity written with the landing (an exit by role). */
  restore: number | null;
  /**
   * The restore returns to the stylesheet's opacity (an exit by role on a
   * surface no call owns opacity on): the stylesheet owns it again.
   */
  restoreIsBorrowed?: boolean;
}

/** What the planner reads of the animator, at the call's time. */
export interface ReducedMotionView {
  valueAt(property: MotionProperty, time: number): number;
  /** Where the opacity is heading (a running fade's end, else its value). */
  opacityHeading(): number;
  /** The element's own (stylesheet) opacity. */
  ownOpacity(): number;
  /** Whether the animator writes the element's opacity itself. */
  writesOwnOpacity(): boolean;
  /** The stylesheet opacity a running dip borrowed, if any. */
  readonly borrowedOpacity: number | null;
  readonly hasOpacityCurve: boolean;
  readonly restingOpacity: number;
  /** Whether a move of an earlier call still waits to land. */
  readonly hasPendingLanding: boolean;
}

/** What Reduce Motion makes of a call. */
export interface ReducedMotionPlan {
  /** Properties written at once, with no curve. */
  readonly atOnce: MotionProperty[];
  /** The opacity fade, when the call fades. */
  readonly opacityFade: FadePoint[] | null;
  /** Values that stay where they are until the landing writes them. */
  readonly holds: Partial<Record<MotionProperty, number>>;
  readonly landing: PlannedLanding | null;
  /** The stylesheet opacity a dip borrowed (no call owns opacity). */
  readonly borrowed?: number | null;
}

/** The opacity no call has changed. */
const IDENTITY_OPACITY = 1;

/**
 * Plans one call under Reduce Motion: with `fade`, an opacity-only
 * cross-fade whose travel lands while the element is transparent; without,
 * everything at once. `role` gives a call that names no opacity its
 * direction (`crossfadeAs`).
 */
export function planReducedMotion(
  view: ReducedMotionView,
  time: number,
  targets: Partial<Record<MotionProperty, number>>,
  properties: ReadonlyArray<MotionProperty>,
  fade: boolean,
  role?: 'entrance' | 'exit',
): ReducedMotionPlan {
  const holds: Partial<Record<MotionProperty, number>> = {};
  if (!fade) {
    return {atOnce: [...properties], opacityFade: null, holds, landing: null};
  }
  const atOnce = properties.filter(property =>
    TRAVEL_PROPERTIES.includes(property),
  );
  const opacityNow = view.valueAt('opacity', time);
  // A fade the call does not name keeps going where it was heading.
  const opacityTo = targets.opacity ?? view.opacityHeading();
  const travel = properties.filter(
    property =>
      TRAVEL_PROPERTIES.includes(property) &&
      Math.abs((targets[property] as number) - view.valueAt(property, time)) >
        1e-9,
  );
  // Only the call's own opacity (or its role) makes it an entrance or an
  // exit: a fade it does not name, such as a dip still running, does not.
  const named = targets.opacity != null;
  let entering = named && opacityTo > opacityNow + 1e-6;
  let leaving = named && opacityTo < opacityNow - 1e-6;
  let fadeFrom = opacityNow;
  let fadeTo = opacityTo;
  let restore: number | null = null;
  // A fade by role on a surface no call owns opacity on starts from, or
  // returns to, the element's own (stylesheet) opacity, as a dip does.
  const roleBorrow =
    role != null &&
    !named &&
    view.borrowedOpacity == null &&
    !view.hasOpacityCurve &&
    view.restingOpacity === IDENTITY_OPACITY &&
    !view.writesOwnOpacity()
      ? view.ownOpacity()
      : null;
  if (!entering && !leaving && role === 'entrance') {
    entering = true;
    // From transparent, or from where a running fade (an exit caught
    // midway) has it.
    fadeFrom = view.hasOpacityCurve ? opacityNow : 0;
    fadeTo = roleBorrow ?? opacityTo;
  } else if (!entering && !leaving && role === 'exit') {
    leaving = true;
    fadeFrom = roleBorrow ?? opacityNow;
    fadeTo = 0;
    restore = roleBorrow ?? opacityTo;
  }
  // A move still waiting to land (an earlier dip's) lands at this call's
  // invisible moment, never while the element shows.
  const pending = view.hasPendingLanding;
  // Not a theme role: no theme lengthens it (design:reduced-motion DR4).
  const ms = reducedMotionCrossFade.durationMs;
  const landsLater = (
    at: number,
    fadeIn: PlannedLanding['fadeIn'],
  ): PlannedLanding => {
    const values = new Map<MotionProperty, number>();
    for (const property of travel) {
      holds[property] = view.valueAt(property, time);
      values.set(property, targets[property] as number);
    }
    return {
      at,
      values,
      fadeIn,
      restore,
      ...(roleBorrow != null && restore != null
        ? {restoreIsBorrowed: true}
        : {}),
    };
  };
  // Travel lands only while the element is transparent (DR1, DR2): an
  // entrance that starts visible, or an exit that ends visible, dips instead
  // when it has travel or a waiting landing to carry.
  const carries = travel.length > 0 || pending;
  if (entering && !pending && (!carries || fadeFrom <= 1e-6)) {
    // Lands at once (the travel is written at once) and fades in.
    return {
      atOnce,
      opacityFade: [
        {at: 0, value: fadeFrom},
        {at: ms, value: fadeTo},
      ],
      holds,
      landing: null,
      borrowed: roleBorrow,
    };
  }
  if (leaving && (!carries || fadeTo <= 1e-6)) {
    // Fades out in place, then lands.
    const opacityFade = [
      {at: 0, value: fadeFrom},
      {at: ms, value: fadeTo},
    ];
    return {
      atOnce,
      opacityFade,
      holds,
      landing:
        travel.length > 0 || restore != null || pending
          ? landsLater(ms, null)
          : null,
    };
  }
  if (carries) {
    // A dip: fades out, lands while transparent, fades back in. When no
    // call owns opacity it starts from and returns to the element's own
    // (stylesheet) opacity, not the model's 1.
    // A dip still running on borrowed opacity (its fade out or back in)
    // lends the same borrow to the next one: overlapping dips never pin
    // the stylesheet's value inline.
    const priorBorrow = view.borrowedOpacity;
    // An opacity the animator left inline (a `set` over a stylesheet that
    // hides or dims the element) is owned too: a dip returns to it.
    const ownsOpacity =
      named ||
      (priorBorrow == null &&
        (view.hasOpacityCurve ||
          view.restingOpacity !== IDENTITY_OPACITY ||
          view.writesOwnOpacity()));
    const borrowed = ownsOpacity ? null : (priorBorrow ?? view.ownOpacity());
    if (borrowed != null && borrowed <= 1e-6) {
      // A stylesheet that hides the element lends nothing: invisible, the
      // move lands at once, with no dip.
      return {atOnce, opacityFade: null, holds, landing: null};
    }
    // It opens at the opacity on screen: an earlier dip's, when one is
    // still running, else the borrowed stylesheet value.
    const opacityFade = [
      {
        at: 0,
        value: view.hasOpacityCurve ? opacityNow : (borrowed ?? opacityNow),
      },
      {at: ms / 2, value: 0},
    ];
    const landing = landsLater(ms / 2, {
      to: borrowed ?? opacityTo,
      ms: ms / 2,
      isBorrowed: borrowed != null,
    });
    return {atOnce, opacityFade, holds, landing, borrowed};
  }
  return {
    atOnce: 'opacity' in targets ? [...atOnce, 'opacity'] : atOnce,
    opacityFade: null,
    holds,
    landing: null,
  };
}
