// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input The domain files of the UIKit constants table
 * @output Re-exports `springs`, `scroll`, `timing`, `navigation` and the
 *   gesture thresholds (one `UIKIT_*` group per recognizer, their union
 *   `UIKIT_GESTURES`, and the haptic tables)
 * @position Entry of the UIKit constants table (motion/uikit). Internal to
 *   core: not exported from the package entry point
 *
 * THE table (`spec:AST-094` FR1, FR2): every spring, duration, deceleration rate, rubber-band
 * constant, timing curve and gesture threshold a touch presentation uses
 * comes from here, with its source next to it. Components never carry their
 * own numbers.
 *
 * SYNC: When a domain file is added, re-export it here and list it in
 * /packages/core/src/motion/README.md.
 */

export {
  HAPTIC_FEEDBACK_KINDS,
  HAPTIC_VIBRATION_PATTERNS,
  UIKIT_CLICK,
  UIKIT_CONTROL,
  UIKIT_GESTURES,
  UIKIT_LONG_PRESS,
  UIKIT_PAN,
  UIKIT_PINCH,
  UIKIT_PRESS,
  UIKIT_ROTATION,
  UIKIT_SCREEN_EDGE_PAN,
  UIKIT_SWIPE,
  UIKIT_TAP,
  UIKIT_VELOCITY,
  type GestureConstant,
  type GestureConstantUnit,
  type HapticFeedbackKind,
} from './gestures';
export {navigation} from './navigation';
export {scroll} from './scroll';
export {springs} from './springs';
export {timing} from './timing';
