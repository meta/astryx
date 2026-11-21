// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file settleThreshold.ts
 * @input Nothing
 * @output SETTLE_THRESHOLD: how close to its target a curve counts as over,
 *   per motion property
 * @position Shared by the animator and by code that sizes a motion without
 *   loading the animator (utils/touchRuntime.ts loads it after first paint)
 */

import type {MotionProperty} from './animator';

/**
 * Within this of its target a curve is over (in the property's own unit). A
 * curve built outside the animator (a progress curve) settles where a call
 * would with this as its epsilon.
 */
export const SETTLE_THRESHOLD: Record<MotionProperty, number> = {
  x: 0.05,
  y: 0.05,
  rotate: 0.01,
  scaleX: 0.0001,
  scaleY: 0.0001,
  opacity: 0.001,
};
