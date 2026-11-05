// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file monthYearToggle.stylex.ts
 * @input StyleX constants
 * @output Exports monthYearToggleMotion, UIDatePicker's month/year toggle
 *   timing for the calendar under a finger
 * @position Internal constants consumed by TouchDateField.tsx and
 *   TouchDateTimeField.tsx; not a package export (the released DateInput
 *   tokens live in tokens.stylex.ts)
 *
 * SYNC: When modified, update:
 * - /packages/core/src/motion/uikit/datePicker.ts (the measured values)
 * - /packages/core/src/DateInput/DateInputTouch.test.tsx (holds them equal)
 */

import * as stylex from '@stylexjs/stylex';
/**
 * UIDatePicker's month/year toggle under a finger, from the UIKit constants
 * table (motion/uikit/datePicker.ts `calendar.monthYearToggle`). The duration
 * and curve are the `timing.stateChangeMs` and `timing.curves.move` motion
 * roles, read as CSS variables with their table values as fallbacks. StyleX
 * inlines only literal constants, so a test holds these to the table.
 */
export const monthYearToggleMotion = stylex.defineConsts({
  /** Every fade of the toggle and the chevron's turn: timing.stateChangeMs. */
  duration: 'var(--motion-timing-state-change-ms, 250ms)',
  /** `UIView.animate`'s default curve: timing.curves.move. */
  curve: 'var(--motion-timing-curves-move, cubic-bezier(0.42, 0, 0.58, 1))',
  /** The title chevron's quarter turn: chevronTurnDegrees. */
  chevronTurn: '90deg',
});
