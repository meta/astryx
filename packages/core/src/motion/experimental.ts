// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file experimental.ts
 * @input The motion foundation: animator, useAnimator, spring and rubber-band
 *   math, cubic-bézier curves, theme motion roles and the UIKit constants table
 * @output The `@astryxdesign/core/motion/experimental` entry point
 * @position Experimental public subpath (spec:AST-017 FR21): outside the
 *   stable compatibility promise, never re-exported from the package root or
 *   an ordinary subpath. Lab components build touch presentations on it.
 *
 * Everything here is experimental: it may change or be removed in a patch
 * release. Every declaration it exposes carries `@experimental`.
 *
 * SYNC: When modified, update /packages/core/src/motion/experimental.test.ts,
 * /packages/core/src/motion/useAnimator.doc.mjs and
 * /packages/core/src/motion/README.md.
 */

export {
  animatorFor,
  createAnimator,
  defaultPrefersReducedMotion as prefersReducedMotion,
} from './animator';
export type {
  AnimateOptions,
  Animator,
  AnimatorOptions,
  DecayOptions,
  MotionCurve,
  MotionHandle,
  MotionProperty,
  MotionValues,
  SpringTransition,
} from './animator';

export {useAnimator} from './useAnimator';
export type {UseAnimatorResult} from './useAnimator';

export {solveSpring, toSpring} from './spring';
export type {
  DurationBounce,
  ResponseDamping,
  Spring,
  SpringCurve,
  SpringDescription,
} from './spring';

export {rubberBand, rubberBandInverse} from './rubberBand';

export {resolveMotion} from './resolveMotion';
export {
  REDUCED_MOTION_FADE_QUERY,
  REDUCED_MOTION_INSTANT_QUERY,
  reducedMotionFade,
} from './reducedMotion';
export type {ReducedMotionFade} from './reducedMotion';
export type {MotionCurvePoints} from './roles';

export {cubicBezier} from './bezier';
export type {BezierPoints} from './bezier';

/**
 * The UIKit constants table, read-only: `uikit.springs`, `uikit.scroll`,
 * `uikit.timing`, `uikit.navigation`, `uikit.UIKIT_GESTURES` and the haptic
 * tables, each value with its source.
 * @experimental
 */
export * as uikit from './uikit';
