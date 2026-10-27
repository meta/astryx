// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input The domain files of the UIKit constants table
 * @output Re-exports `springs` and one constant per spring (`SHEET_PRESENT_SPRING`,
 *   …), `scroll`, `timing`, `navigation` and the
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
export {navigation, registerNavigationTable} from './navigation';
export {registerScrollTable, scroll} from './scroll';
export {
  ACTION_SHEET_DISMISS_SPRING,
  ACTION_SHEET_PRESENT_SPRING,
  ALERT_DISMISS_SPRING,
  ALERT_PRESENT_SPRING,
  BANNER_SPRING,
  CONTEXT_MENU_DISMISS_SPRING,
  CONTEXT_MENU_LIFT_SPRING,
  DIRECT_CHANGE_SPRING,
  EMPHASIS_SPRING,
  FINGER_TRACKING_SPRING,
  KEYBOARD_SPRING,
  MENU_CLOSE_SPRING,
  MENU_OPEN_SPRING,
  MENU_REDUCED_MOTION_SPRING,
  NAVIGATION_BAR_ELEMENTS_SPRING,
  NAVIGATION_INTERACTIVE_POP_FINISH_SPRING,
  NAVIGATION_POP_SPRING,
  NAVIGATION_PUSH_SPRING,
  QUICK_CHANGE_SPRING,
  SEGMENTED_THUMB_SPRING,
  SETTLE_SPRING,
  SHEET_DETENT_SPRING,
  SHEET_DISMISS_SPRING,
  SHEET_DISMISS_SWIPE_SPRING,
  SHEET_PRESENT_SPRING,
  SHEET_RELEASE_FAST_SPRING,
  STATE_CHANGE_SPRING,
  SUB_MENU_BACK_SPRING,
  SUB_MENU_OPEN_SPRING,
  SWITCH_THUMB_MOVE_SPRING,
  SWITCH_THUMB_STRETCH_SPRING,
  TIMED_CHANGE_SPRING,
  VIEW_CHANGE_SPRING,
  registerSpringsTable,
  springs,
} from './springs';
export {registerTimingTable, timing} from './timing';
