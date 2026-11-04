// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file datePicker.ts
 * @input Nothing; data only
 * @output Exports `datePicker`: the rules UIDatePicker adds to its wheels. The
 *   month/year wheels change the date, the AM/PM column follows the hour, a
 *   column turns back onto a bound, and a day clamps to its month.
 * @position The date picker domain of the UIKit constants table
 *   (motion/uikit), for the date and time touch sheets. Every leaf names its
 *   source, which uikit.test.ts checks.
 *
 * SYNC: When modified, update /packages/core/src/motion/MEASUREMENTS.md and
 * /packages/core/src/motion/README.md.
 */

export const datePicker = {
  calendar: {
    monthYearWheels: {
      /**
       * Turning the month or year wheel changes the picker's date, keeping
       * the day, and fires `valueChanged`.
       * @source measured: UIKit lab, iOS 26.2 simulator, `.date` `.inline`,
       *   October 15 → May 15 after the month wheel's fling, with a
       *   `valueChanged` carrying May 15, Oct 23 2026
       */
      changesDate: true,
    },
  },
  wheels: {
    /**
     * In 12-hour time the AM/PM column follows the hour. Turning the hour from
     * 11 to 12 turns the time from AM to PM, and back. From 12 to 1 it keeps
     * the half of the day.
     * @source measured: UIKit lab, iOS 26.2 simulator, `.time` `.wheels`,
     *   en_US: 11:58 AM, hour wheel +1 row → `valueChanged` 12:58 PM; then
     *   the minute wheel's +4 rows carried the hour from 12 to 1 → 1:02 PM,
     *   Oct 23 2026
     */
    meridiemFollowsHour: true,
    /**
     * A column that comes to rest past `minimumDate` or `maximumDate` turns
     * back onto the bound. Its `valueChanged` already carries the bound. For
     * example, with bounds 9:00–17:00, the hour of 10:00 dragged to 7 reads
     * 9:00 at rest. The hour column then turns 64 pt, two rows, back to 9.
     * @source measured: UIKit lab, iOS 26.2 simulator, `.time` `.wheels`
     *   with bounds 9:00–17:00 and `minuteInterval` 15, per-frame hour
     *   offsets after the rest (0.4, 2, 7.4, 16, 26.4, 37.7, 48.3, 56.7,
     *   62, 64 pt at 33 ms steps) and the `valueChanged` time, Oct 23 2026
     */
    restPastBound: 'turnToBound',
    /**
     * In `.date` wheels a day the month does not have clamps to the month's
     * last day (January 30, month +1 → February 28).
     * @source measured: UIKit lab, iOS 26.2 simulator, `.date` `.wheels`
     *   with bounds Jun 1 2026 – Mar 15 2027, Oct 23 2026
     */
    dayClampsToMonth: true,
  },
} as const;
