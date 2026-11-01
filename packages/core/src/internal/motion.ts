// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file motion.ts
 * @input The motion foundation: the animator, the cubic-bézier solver, and
 *   UIKit's timing table
 * @output `@astryxdesign/core/internal/motion`: the motion foundation's
 *   primitives for Lab components, re-exported by name
 * @position An internal entry reserved for Astryx's own packages:
 *   undocumented, outside the public API and its compatibility promise
 *   (spec:AST-017 FR21), versioned in lockstep with Core, and allowed only in
 *   Core and Lab by the `@astryx/no-core-internal-import` lint rule
 *   (architecture:react-component-runtime INV13). Core components import the
 *   same modules by relative path. Named re-exports only, never a gathering
 *   object: a bundler keeps one copy per page and only what a component uses
 *   (architecture:component-style-authoring INV6).
 *
 * SYNC: When modified, update motion.test.ts and scripts/sync-exports.js.
 */

export {createAnimator} from '../motion/animator';
export type {
  AnimateOptions,
  Animator,
  AnimatorOptions,
  MotionCurve,
  MotionHandle,
} from '../motion/animator';
export {cubicBezier} from '../motion/bezier';
export {timing} from '../motion/uikit/timing';
