// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input The modules of packages/core/src/gestures
 * @output Re-exports the gesture system for core's own components
 * @position Core's own barrel, imported by relative path. Lab reaches the
 *   gesture primitives through `@astryxdesign/core/internal/touch`
 *   (architecture:react-component-runtime INV13), never this file.
 */

export {GestureArena, browserClock} from './GestureArena';
export type {
  ArenaBeganInput,
  ClickDisposition,
  GestureArenaOptions,
  GestureClock,
} from './GestureArena';
export {GestureHost, getGestureHost} from './GestureHost';
export {holdPageScroll} from './pageHold';
export type {PageScrollDecision} from './pageHold';
export type {AttachOptions, GestureHostOptions} from './GestureHost';
export {
  GestureRecognizer,
  isActive,
  isTerminal,
  isTransitionAllowed,
} from './GestureRecognizer';
export type {
  GestureListener,
  GestureRecognizerOptions,
  GestureTransitionListener,
  NativeTouchBehavior,
} from './GestureRecognizer';
export {
  attachTapHaptic,
  canVibrate,
  playHaptic,
  supportsSwitchControl,
} from './haptics';
export {HoverGestureRecognizer} from './HoverGestureRecognizer';
export {LongPressGestureRecognizer} from './LongPressGestureRecognizer';
export type {LongPressGestureRecognizerOptions} from './LongPressGestureRecognizer';
export {createNativeScrollProbe, parseTouchAction} from './nativeScroll';
export {PanGestureRecognizer} from './PanGestureRecognizer';
export type {
  PanDirection,
  PanGestureRecognizerOptions,
} from './PanGestureRecognizer';
export {PinchGestureRecognizer} from './PinchGestureRecognizer';
export type {PinchGestureRecognizerOptions} from './PinchGestureRecognizer';
export {PRESS_PROFILES, PressTracker} from './PressTracker';
export type {
  ControlEvent,
  PressBounds,
  PressHighlightDelay,
  PressProfile,
  PressProfileName,
  PressTrackerOptions,
} from './PressTracker';
export {RotationGestureRecognizer} from './RotationGestureRecognizer';
export type {RotationGestureRecognizerOptions} from './RotationGestureRecognizer';
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
export {TapGestureRecognizer} from './TapGestureRecognizer';
export type {TapGestureRecognizerOptions} from './TapGestureRecognizer';
export {deriveTouchAction, gestureHostStyle} from './touchAction';
export type {GestureHostStyle} from './touchAction';
export type * from './types';
export {DEFAULT_ENVIRONMENT} from './types';
export {useGestureRecognizer} from './useGestureRecognizer';
export type {UseGestureRecognizerOptions} from './useGestureRecognizer';
export {usePressTracker} from './usePressTracker';
export type {UsePressTrackerOptions} from './usePressTracker';
export {VelocityTracker} from './VelocityTracker';
export type {VelocityTrackerOptions} from './VelocityTracker';
