// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touch.ts
 * @input The gesture core: the arena, the recognizers and their geometry.
 *   Also the pan, the motion engine and math, and the touch-presentation,
 *   direction, focus and hit-area helpers that Lab components read
 * @output `@astryxdesign/core/internal/touch`: the gesture core's primitives
 *   and the motion, touch-presentation, direction, focus and hit-area
 *   modules for Lab components, re-exported by name
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

// Lab's useRefreshControl reads these: its pull's pan and the hook that
// starts it. It also reads the motion engine and math, and the scroll
// view's bounce spring, for its pull, settle and end. Its indicator fades
// along the settle's curve, and the motion-role parsers read the theme's
// tokens for its end.
export {PanGestureRecognizer} from '../gestures/PanGestureRecognizer';
export type {PanGestureRecognizerOptions} from '../gestures/PanGestureRecognizer';
export type {
  GestureEventContext,
  GestureTouch,
  PointerKind,
} from '../gestures/types';
export {useGestureRecognizer} from '../gestures/useGestureRecognizer';
// The motion engine's factory. The public one, `createAnimator`, plays
// only the theme's state-change motion.
export {createMotionEngine} from '../motion/animator';
export type {
  Animator as MotionEngine,
  AnimatorOptions as MotionEngineOptions,
  MotionCurve,
} from '../motion/animator';
export {cubicBezier} from '../motion/bezier';
export {mapProgress} from '../motion/progress';
export {parseCssEasing, parseMotionRoleValue} from '../motion/roles';
export {
  rubberBand,
  rubberBandInverse,
  rubberBandSlope,
} from '../motion/rubberBand';
export {scroll} from '../motion/uikit/scroll';

// Lab components also read the UIKit gesture table, the touch presentation
// and its query, and an element's direction.
export {isRtlElement} from '../hooks/isRtlElement';
export {UIKIT_GESTURES} from '../motion/uikit/gestures';
export {useTouchPresentation} from '../utils/touchPresentation';
export {TOUCH_QUERY} from '../utils/touchQueries';

// Lab's NavigationStack reads these.
export {ScreenEdgePanGestureRecognizer} from '../gestures/ScreenEdgePanGestureRecognizer';
export {resolveMotion} from '../motion/resolveMotion';
export {solveSpring, toSpring} from '../motion/spring';
export type {SpringDescription} from '../motion/spring';
export {navigation} from '../motion/uikit/navigation';
export {
  NAVIGATION_BAR_ELEMENTS_SPRING,
  NAVIGATION_INTERACTIVE_POP_FINISH_SPRING,
  NAVIGATION_POP_SPRING,
  NAVIGATION_PUSH_SPRING,
} from '../motion/uikit/springs';
export {focusForLastInput, isFocusLost} from '../utils/focusReturn';
export {useInteractionModalityTracking} from '../utils/interactionModality';

// Lab components that watch a finger's scroll read whether a scroller's
// scroll is a finger's, and act when that scroll ends.
export {useFingerScroll} from '../gestures/useFingerScroll';
export type {UseFingerScrollOptions} from '../gestures/useFingerScroll';

// Lab's NavigationStack scroll edge effect reads the finger-scroll hook
// above, and drops the veil's compositing layer when a finger's scroll ends.
// It reads the gesture host for a finger's landing. The stack's bars read the
// coarse-pointer check.
export {getGestureHost} from '../gestures/GestureHost';
export {isCoarsePointer} from '../utils/coarsePointer';
// Lab's PageControl also reads an element's shared animator, the Reduce
// Motion cross-fade, and the touch hit area's hook and layer.
export {animatorFor} from '../motion/animator';
export {reducedMotionFade} from '../motion/reducedMotion';
export {useTouchHitArea} from '../utils/touchHitArea';
export {touchHitAreaStyles} from './touchHitArea.stylex';

// Lab's TabBar tracks its press with the shared action-group tracker.
export {useActionGroupTracking} from '../hooks/useActionGroupTracking';
export type {ActionGroupTrackingOptions} from '../hooks/useActionGroupTracking';

// Lab's TabBar finds a panel's scroll area with Core's scroll test.
export {measureLogicalScrollAxis} from '../hooks/scrollGeometry';
