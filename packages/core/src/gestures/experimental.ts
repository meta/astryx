// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file experimental.ts
 * @input The gesture system: recognizers, their hooks, the press tracker, the
 *   touch presentation resolver and haptics
 * @output The `@astryxdesign/core/gestures/experimental` entry point
 * @position Experimental public subpath (spec:AST-017 FR21): outside the
 *   stable compatibility promise, never re-exported from the package root or
 *   an ordinary subpath. Lab components build touch presentations on it.
 *
 * Everything here is experimental: it may change or be removed in a patch
 * release. Every declaration it exposes carries `@experimental`.
 *
 * SYNC: When modified, update /packages/core/src/gestures/experimental.test.ts
 * and /packages/core/src/gestures/README.md.
 */

export {GestureRecognizer, isActive, isTerminal} from './GestureRecognizer';
export type {
  GestureListener,
  GestureRecognizerOptions,
  GestureTransitionListener,
  NativeTouchBehavior,
} from './GestureRecognizer';

export type {
  GestureEnvironment,
  GestureEventContext,
  GestureState,
  GestureTouch,
  NativeScrollProbe,
  Point,
  PointerKind,
  TouchBeganInput,
  TouchConsumer,
  TouchInput,
  TouchPhase,
  TouchSample,
} from './types';

export {TapGestureRecognizer} from './TapGestureRecognizer';
export type {TapGestureRecognizerOptions} from './TapGestureRecognizer';
export {LongPressGestureRecognizer} from './LongPressGestureRecognizer';
export type {LongPressGestureRecognizerOptions} from './LongPressGestureRecognizer';
export {PanGestureRecognizer} from './PanGestureRecognizer';
export type {
  PanDirection,
  PanGestureRecognizerOptions,
} from './PanGestureRecognizer';
export {ScreenEdgePanGestureRecognizer} from './ScreenEdgePanGestureRecognizer';
export type {
  ScreenEdge,
  ScreenEdgePanGestureRecognizerOptions,
} from './ScreenEdgePanGestureRecognizer';
export {SwipeGestureRecognizer} from './SwipeGestureRecognizer';
export type {
  SwipeDirection,
  SwipeGestureRecognizerOptions,
} from './SwipeGestureRecognizer';
export {PinchGestureRecognizer} from './PinchGestureRecognizer';
export type {PinchGestureRecognizerOptions} from './PinchGestureRecognizer';
export {RotationGestureRecognizer} from './RotationGestureRecognizer';
export type {RotationGestureRecognizerOptions} from './RotationGestureRecognizer';
export {HoverGestureRecognizer} from './HoverGestureRecognizer';

export {useGestureRecognizer, usePressTracker} from './useGestureRecognizer';
export type {
  UseGestureRecognizerOptions,
  UsePressTrackerOptions,
} from './useGestureRecognizer';
export {PRESS_PROFILES, PressTracker} from './PressTracker';
export type {
  ControlEvent,
  PressBounds,
  PressHighlightDelay,
  PressProfile,
  PressProfileName,
  PressTrackerOptions,
} from './PressTracker';

export {
  readTouchPresentation,
  useTouchPresentation,
} from '../utils/touchPresentation';
export type {TouchPresentation} from '../utils/touchPresentation';

export {playHaptic} from './haptics';
export type {HapticFeedbackKind} from '../motion/uikit';
