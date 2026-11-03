// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touch.ts
 * @input The gesture core: the arena, the recognizers, and their geometry
 * @output `@astryxdesign/core/internal/touch`: the gesture core's primitives
 *   for Lab components, re-exported by name
 * @position An internal entry reserved for Astryx's own packages:
 *   undocumented, outside the public API and its compatibility promise
 *   (spec:AST-017 FR21), versioned in lockstep with Core, and allowed only in
 *   Core and Lab by the `@astryx/no-core-internal-import` lint rule
 *   (architecture:react-component-runtime INV13). Core components import the
 *   same modules by relative path. Named re-exports only, never a gathering
 *   object: a bundler keeps one copy per page and only what a component uses
 *   (architecture:component-style-authoring INV6). Importing it attaches no
 *   listeners: a recognizer listens only once a component starts it under a
 *   coarse pointer (`spec:AST-094` FR19, FR24).
 *
 * SYNC: When modified, update scripts/touch-support-bundle.test.mjs and
 * touch.test.ts.
 */

export {browserClock, GestureArena} from '../gestures/GestureArena';
export {
  ALL_NATIVE_TOUCH,
  GestureRecognizer,
  isActive,
  isTerminal,
  isTransitionAllowed,
  MANIPULATION,
} from '../gestures/GestureRecognizer';
export {
  angleBetween,
  centroid,
  distance,
  travel,
  unwrapAngle,
} from '../gestures/geometry';
export {LongPressGestureRecognizer} from '../gestures/LongPressGestureRecognizer';
export {TapGestureRecognizer} from '../gestures/TapGestureRecognizer';
export {DEFAULT_ENVIRONMENT} from '../gestures/types';
