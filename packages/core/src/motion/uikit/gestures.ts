// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file gestures.ts
 * @input Nothing: plain data
 * @output Exports one constant per recognizer or domain (UIKIT_TAP,
 *   UIKIT_LONG_PRESS, UIKIT_PAN, …, UIKIT_PRESS, UIKIT_VELOCITY), the gesture
 *   thresholds recognizers read, a reader importing only its group; their
 *   union UIKIT_GESTURES; and the GestureConstant type: a value and its unit
 * @position Gesture half of the UIKit constants table. Springs, scroll
 *   physics and timing live beside it in this folder; no component carries a
 *   gesture number of its own.
 *
 * Units are CSS pixels and milliseconds. On a phone with
 * `width=device-width`, one CSS pixel is one UIKit point, so a UIKit distance
 * in points is the same number here.
 *
 * Every leaf carries one or more `@source` (apple-docs | wwdc | webkit |
 * measured | GUESS); webkit and GUESS values also carry the `@measure` task
 * that will confirm or replace them (MEASUREMENTS.md lists them all).
 * uikit.test.ts enforces both. Only the value and its unit ship: where a
 * number comes from stays in its JSDoc, out of the bundle. The press clocks
 * are the same values as `DELAYS_CONTENT_TOUCHES_MS` and timing's `press`,
 * written as numbers so each group bundles alone; gestures.test.ts holds
 * them equal. Safari on iOS runs UIKit's own
 * recognizers for tap-to-click, long press, double tap and the start of a
 * page scroll, so many guesses can be settled by measuring Safari itself.
 *
 * The measurements the sources name:
 * - UIKit lab: in-process reads and touch runs of fresh UIKit recognizers
 *   (private ivars read with key-value coding, every value confirmed with HID
 *   touches and the recognizer state log), iPhone 17 Pro simulator, iOS 26.2.
 * - Settings and Contacts: the repository's own measurement of the touch
 *   press model, recorded in packages/core/src/utils/pressGesture.ts, driven
 *   with real HID touches and filmed at 60 fps.
 * - Mobile Safari: Safari page scroll is a UIScrollView; the distance at which
 *   it claims a slow drag is where a press becomes a scroll, and the last
 *   moment a page can still cancel the scroll.
 *
 * SYNC: When modified, update packages/core/src/motion/uikit/gestures.test.ts.
 */

import {DELAYS_CONTENT_TOUCHES_MS} from './scroll';

export type GestureConstantUnit =
  'px' | 'ms' | 'px/s' | 'rad' | 'ratio' | 'count';

/**
 * A gesture number and its unit. Where the number comes from is in the
 * entry's JSDoc (`@source`, `@measure`), not in the value.
 */
export interface GestureConstant<T = number> {
  readonly value: T;
  readonly unit: GestureConstantUnit;
}

export const UIKIT_TAP = {
  /**
   * How far each finger may travel from where it landed before a tap
   * fails, as a distance.
   * @source measured: UIKit lab, iOS 26.2 simulator, ivar reads confirmed
   *   with HID touches, Oct 23 2026: UITapGestureRecognizer
   *   _allowableMovement 45; 44 pt taps, 46 pt fails, the same on the
   *   diagonal
   */
  allowableMovement: {value: 45, unit: 'px'},
  /**
   * Longest interval between one tap lifting and the next landing.
   * @source measured: UIKit lab, iOS 26.2 simulator, ivar reads confirmed
   *   with HID touches, Oct 23 2026: _maximumIntervalBetweenSuccessiveTaps
   *   0.35 s; 330 ms double-taps, 370 ms does not
   */
  maximumIntervalBetweenTaps: {value: 350, unit: 'ms'},
  /**
   * How far a later tap may land from the first one of the sequence.
   * @source measured: UIKit lab, iOS 26.2 simulator, ivar reads confirmed
   *   with HID touches, Oct 23 2026: _allowableSeparation is unbounded and
   *   the 45 pt movement rule applies between taps; 44 pt double-taps, 46
   *   does not
   */
  allowableSeparation: {value: 45, unit: 'px'},
  /**
   * Longest a finger may stay down and still tap.
   * @source measured: UIKit lab, iOS 26.2 simulator, ivar reads confirmed
   *   with HID touches, Oct 23 2026: maximumTapDuration 1.5 s; a 1.4 s hold
   *   taps, 1.6 s does not
   */
  maximumTapDuration: {value: 1500, unit: 'ms'},
} as const satisfies Record<string, GestureConstant>;

export const UIKIT_LONG_PRESS = {
  /**
   * UILongPressGestureRecognizer.minimumPressDuration default.
   * @source apple-docs
   *   https://developer.apple.com/documentation/uikit/uilongpressgesturerecognizer/minimumpressduration
   * @source measured: UIKit lab, iOS 26.2 simulator, ivar reads confirmed
   *   with HID touches, Oct 23 2026: _minimumPressDuration 0.5
   */
  minimumPressDuration: {value: 500, unit: 'ms'},
  /**
   * UILongPressGestureRecognizer.allowableMovement default, a distance.
   * @source apple-docs
   *   https://developer.apple.com/documentation/uikit/uilongpressgesturerecognizer/allowablemovement
   * @source measured: UIKit lab, iOS 26.2 simulator, ivar reads confirmed
   *   with HID touches, Oct 23 2026: a (7, 7) drift begins, (7.2, 7.2) fails
   */
  allowableMovement: {value: 10, unit: 'px'},
} as const satisfies Record<string, GestureConstant>;

export const UIKIT_PAN = {
  /**
   * Travel before a pan begins, PER AXIS: |dx| or |dy| reaching it. The
   * translation is reset when the pan begins, so the hysteresis is not
   * part of it. Kept below the distance at which WebKit claims a drag for
   * scrolling, so a pan that must cancel the native scroll still sees
   * cancelable `touchmove`s.
   * @source measured: UIKit lab, iOS 26.2 simulator, ivar reads confirmed
   *   with HID touches, Oct 23 2026: UIPanGestureRecognizer _hysteresis 10; x
   *   and y began at 10.0, a diagonal at (10.67, 10.67); translation(in:) is
   *   0 at .began
   */
  hysteresis: {value: 10, unit: 'px'},
} as const satisfies Record<string, GestureConstant>;

export const UIKIT_SWIPE = {
  /**
   * Travel along the swipe direction before a swipe is recognized.
   * @source measured: UIKit lab, iOS 26.2 simulator, ivar reads confirmed
   *   with HID touches, Oct 23 2026: UISwipeGestureRecognizer minimum primary
   *   movement 50; recognized during the motion; 40 pt does not
   */
  minimumDistance: {value: 50, unit: 'px'},
  /**
   * Longest a swipe may take before it fails.
   * @source measured: UIKit lab, iOS 26.2 simulator, ivar reads confirmed
   *   with HID touches, Oct 23 2026: UISwipeGestureRecognizer maximum
   *   duration 0.5 s
   */
  maximumDuration: {value: 500, unit: 'ms'},
  /**
   * Travel across the swipe direction that fails it.
   * @source measured: UIKit lab, iOS 26.2 simulator, ivar reads confirmed
   *   with HID touches, Oct 23 2026: UISwipeGestureRecognizer maximum
   *   secondary movement 50
   */
  maximumSecondaryMovement: {value: 50, unit: 'px'},
  /**
   * How the minimum movement relaxes over time. Read, not modelled: a
   * 120 pt swipe over 0.8 s was recognized at 303 ms, below 50 pt of travel.
   * @source measured: UIKit lab, iOS 26.2 simulator, ivar reads confirmed
   *   with HID touches, Oct 23 2026: UISwipeGestureRecognizer
   *   rateOfMinimumMovementDecay 0.06 (not modelled)
   */
  minimumMovementDecay: {value: 0.06, unit: 'ratio'},
} as const satisfies Record<string, GestureConstant>;

export const UIKIT_PINCH = {
  /**
   * Change of the distance between two fingers before a pinch begins. The
   * scale is then measured against the starting span moved by this much,
   * so it does not jump.
   * @source measured: UIKit lab, iOS 26.2 simulator, ivar reads confirmed
   *   with HID touches, Oct 23 2026: UIPinchGestureRecognizer _hysteresis 8;
   *   out from 120 began at 144 with scale 1.125 (= 144 / 128)
   */
  hysteresis: {value: 8, unit: 'px'},
} as const satisfies Record<string, GestureConstant>;

export const UIKIT_ROTATION = {
  /**
   * Rotation of the two-finger vector before a rotation begins.
   * @source GUESS — UIRotationGestureRecognizer has no scalar threshold among
   *   its ivars; 5 degrees. The simulator HID cannot rotate two fingers: a
   *   device run (or an XCUITest rotate) logging the angle at .began.
   * @measure M-G10
   */
  // 5° in radians, written out so the group bundles alone.
  hysteresis: {value: 0.08726646259971647, unit: 'rad'},
} as const satisfies Record<string, GestureConstant>;

export const UIKIT_SCREEN_EDGE_PAN = {
  /**
   * Width of the band at the screen edge a touch must land in.
   * @source measured: UIKit lab, iOS 26.2 simulator, ivar reads confirmed
   *   with HID touches, Oct 23 2026: UIScreenEdgePanGestureRecognizer
   *   _edgeRegionSize 40.2 on a 402 pt wide screen (10 % of it); edge pans
   *   cannot begin from simulator HID
   */
  edgeRegion: {value: 40.2, unit: 'px'},
  /**
   * Travel before an edge pan begins.
   * @source measured: UIKit lab, iOS 26.2 simulator, ivar reads confirmed
   *   with HID touches, Oct 23 2026: the screen-edge pan hysteresis ivar 15
   */
  hysteresis: {value: 15, unit: 'px'},
} as const satisfies Record<string, GestureConstant>;

export const UIKIT_CONTROL = {
  /**
   * How far outside its bounds a UIControl keeps a press inside: a finger
   * dragged out is still "inside" until it passes this margin.
   * @source measured: UIKit lab, iOS 26.2 simulator, ivar reads confirmed
   *   with HID touches, Oct 23 2026: UIButton (.system) stays inside up to 70
   *   pt out, touchDragExit at 71, touchDragEnter at 69 coming back;
   *   touchUpInside up to 70, touchUpOutside from 71
   */
  trackingExpansion: {value: 70, unit: 'px'},
} as const satisfies Record<string, GestureConstant>;

export const UIKIT_PRESS = {
  /**
   * UIScrollView.delaysContentTouches: a touch in a scroller highlights after
   * this.
   * @source measured: Settings and Contacts, iOS 26.2 simulator, HID touches
   *   filmed at 60 fps (utils/pressGesture.ts), Oct 6 2026
   */
  contentTouchDelay: {value: DELAYS_CONTENT_TOUCHES_MS, unit: 'ms'},
  /**
   * A tap shorter than the delay shows the highlight at the lift for this
   * long.
   * @source measured: Settings and Contacts, iOS 26.2 simulator, HID touches
   *   filmed at 60 fps (utils/pressGesture.ts), Oct 6 2026
   */
  quickTapFlash: {value: 100, unit: 'ms'},
  /**
   * Travel at which a press is a scroll, not a press.
   * @source measured: Mobile Safari 26.2, iOS 26.2 simulator, slow HID drag
   *   on a scrollable page (1 pt steps): last cancelable touchmove at 10 px,
   *   pointercancel and the first uncancelable touchmove at 11 px, Oct 23
   *   2026
   */
  slop: {value: 10, unit: 'px'},
  /**
   * A touch this soon after a finger-driven scroll moved is a brake, not a
   * press.
   * @source measured: Settings and Contacts, iOS 26.2 simulator, HID touches
   *   filmed at 60 fps (utils/pressGesture.ts), Oct 6 2026
   */
  scrollBrake: {value: 150, unit: 'ms'},
  /**
   * How long after a finger was down a scroll can still be that finger's
   * momentum (the brake only counts scrolls a finger drove).
   * @source GUESS — The press model bound (utils/pressFeedback.ts): iOS
   *   momentum runs for a second or two after the lift.
   * @measure M-G19
   */
  momentumMemory: {value: 3000, unit: 'ms'},
} as const satisfies Record<string, GestureConstant>;

export const UIKIT_VELOCITY = {
  /**
   * UIPanGestureRecognizer.velocity(in:) is this times the newest event's
   * instantaneous velocity plus the rest times the previous event's
   * (instantaneous velocity: position change over timestamp change between
   * consecutive events, the touch-down counting as the first). The lift
   * does not update it, and a finger at rest sends no events, so UIKit
   * reports the last moving value after a pause; Astryx's release reads 0
   * once the finger has rested (`spec:AST-100` FR2).
   * @source measured: UIKit lab, iOS 26.2 simulator, ivar reads confirmed
   *   with HID touches, Oct 23 2026: fitted to all 69 velocity(in:) values of
   *   six HID streams (constant, accelerating, pauses before the lift) to 0.0
   *   pt/s
   */
  currentWeight: {value: 0.2, unit: 'ratio'},
} as const satisfies Record<string, GestureConstant>;

export const UIKIT_CLICK = {
  /**
   * Longest the system waits for the browser's click after a touch it
   * swallows. iOS and Chromium deliver it right after `touchend`; this only
   * bounds a click that never comes.
   * @source GUESS — A safety bound, not a UIKit number.
   * @measure M-G17
   */
  strayClickWindow: {value: 1000, unit: 'ms'},
} as const satisfies Record<string, GestureConstant>;

/**
 * Every group in one object, for a reader that needs several. A reader of
 * one group imports it by name instead (`UIKIT_PAN`): object properties do
 * not tree-shake, so this object bundles every group
 * (`architecture:component-style-authoring` INV6).
 */
export const UIKIT_GESTURES = {
  tap: UIKIT_TAP,
  longPress: UIKIT_LONG_PRESS,
  pan: UIKIT_PAN,
  swipe: UIKIT_SWIPE,
  pinch: UIKIT_PINCH,
  rotation: UIKIT_ROTATION,
  screenEdgePan: UIKIT_SCREEN_EDGE_PAN,
  control: UIKIT_CONTROL,
  press: UIKIT_PRESS,
  velocity: UIKIT_VELOCITY,
  click: UIKIT_CLICK,
} as const;

/**
 * The feedback kinds UIKit's generators offer: UISelectionFeedbackGenerator,
 * UIImpactFeedbackGenerator (.light .medium .heavy .soft .rigid) and
 * UINotificationFeedbackGenerator (.success .warning .error).
 * https://developer.apple.com/documentation/uikit/uifeedbackgenerator
 */
export const HAPTIC_FEEDBACK_KINDS = [
  'selection',
  'impactLight',
  'impactMedium',
  'impactHeavy',
  'impactSoft',
  'impactRigid',
  'notificationSuccess',
  'notificationWarning',
  'notificationError',
] as const;

export type HapticFeedbackKind = (typeof HAPTIC_FEEDBACK_KINDS)[number];

/**
 * `navigator.vibrate` patterns standing in for each kind where the platform
 * has nothing better (Android browsers). Not UIKit numbers: a vibration motor
 * cannot render a Taptic Engine waveform, so these only keep the relative
 * strengths in order.
 * @source GUESS — No UIKit equivalent exists for a vibration motor;
 *   durations only order the strengths.
 * @measure M-G18
 */
export const HAPTIC_VIBRATION_PATTERNS: Record<
  HapticFeedbackKind,
  GestureConstant<ReadonlyArray<number>>
> = {
  selection: {value: [5], unit: 'ms'},
  impactLight: {value: [8], unit: 'ms'},
  impactMedium: {value: [12], unit: 'ms'},
  impactHeavy: {value: [18], unit: 'ms'},
  impactSoft: {value: [10], unit: 'ms'},
  impactRigid: {value: [6], unit: 'ms'},
  notificationSuccess: {value: [8, 60, 12], unit: 'ms'},
  notificationWarning: {value: [12, 80, 12], unit: 'ms'},
  notificationError: {value: [12, 50, 12, 50, 18], unit: 'ms'},
};
