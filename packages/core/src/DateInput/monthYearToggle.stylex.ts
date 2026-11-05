// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file monthYearToggle.stylex.ts
 * @input StyleX constants
 * @output Exports monthYearToggleMotion, the chevron turn of UIDatePicker's
 *   month/year toggle for the calendar under a finger
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
 * table (motion/uikit/datePicker.ts `calendar.monthYearToggle`). Its fades
 * and turn play the theme's tokens; only the turn's angle comes from the
 * table. StyleX inlines only literal constants, so a test holds it to the
 * table.
 */
export const monthYearToggleMotion = stylex.defineConsts({
  /** The title chevron's quarter turn: chevronTurnDegrees. */
  chevronTurn: '90deg',
});
