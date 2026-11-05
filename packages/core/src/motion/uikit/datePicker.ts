// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file datePicker.ts
 * @input Nothing; data only
 * @output Exports `datePicker`: the rules UIDatePicker adds to its calendar
 *   and wheels. Its calendar pages, selects and toggles to the wheels.
 *   The month/year wheels change the date, the AM/PM column follows the hour,
 *   a column turns back onto a bound, and a day clamps to its month.
 * @position The date picker domain of the UIKit constants table
 *   (motion/uikit), for the date and time touch sheets. Every leaf names its
 *   source, which uikit.test.ts checks.
 *
 * SYNC: When modified, update /packages/core/src/motion/MEASUREMENTS.md and
 * /packages/core/src/motion/README.md.
 */

export const datePicker = {
  calendar: {
    selection: {
      /**
       * A tap on a day selects it at once, with no animation. The new day's
       * circle and numeral take their style in the frame of the lift, and
       * `valueChanged` fires then.
       * @source measured: UIKit lab, iOS 26.2 simulator, `.date` `.inline`,
       *   taps on two days with every CAAnimation logged (none on the day
       *   cells) and `valueChanged` timestamps 81–95 ms after touch-down,
       *   Oct 23 2026
       */
      tapAnimates: false,
    },
    monthYearToggle: {
      /**
       * A tap on the title fades the month and year wheels in while the day
       * grid, the weekday row and both chevrons fade out. Each fade takes
       * 0.25 s on UIKit's default curve, and a second tap reverses it.
       * @source measured: UIKit lab, iOS 26.2 simulator, `.date` `.inline`,
       *   title taps opening and closing the wheels: five CABasicAnimation
       *   opacity 0.25 s (`_UICalendarMonthYearSelector`, the
       *   `UICollectionView`, `_UICalendarWeekdayView`, both buttons) under
       *   one `UIView.animate` 0.25 s with options 4, Oct 23 2026
       */
      fadeMs: 250,
      /**
       * The title's chevron turns a quarter turn with the fades. It points
       * along the reading direction for the calendar and down for the wheels.
       * @source measured: UIKit lab, iOS 26.2 simulator, `.date` `.inline`,
       *   the title's UIImageView: CABasicAnimation transform 0.25 s from a
       *   −90° rotation on opening and from +90° on closing, to identity,
       *   Oct 23 2026
       */
      chevronTurnDegrees: 90,
    },
    pager: {
      /**
       * While a finger drags the month grid, the title names the month
       * nearest the content offset. It changes as the content crosses half a
       * page, during the drag and a settle, not at the lift.
       * @source measured: UIKit lab, iOS 26.2 simulator, `.date` `.inline`,
       *   a slow drag released at 70 % of a page: the title turned to the
       *   next month at 51 % (offset 1124 of a 320 pt page from 960), 560 ms
       *   before the lift, Oct 23 2026
       */
      titleFollows: 'nearestPage',
      /**
       * A release picks its month by the paging rule and settles on the
       * paging integrator (`paging.release`, `paging.integrator`). Slow drags
       * released at 30 % and 50 % of a page settle back, and at 70 % on the
       * next month. A drag toward a month past `maximumDate` stays.
       * @source measured: UIKit lab, iOS 26.2 simulator, `.date` `.inline`,
       *   the grid's `UICollectionView` (`isPagingEnabled`,
       *   `decelerationRate` 0.998) read and its offsets logged per frame
       *   for slow drags released at 30, 50 and 70 % and a drag past the
       *   last allowed month, Oct 23 2026
       */
      release: 'paging',
    },
    chevron: {
      /**
       * A tap on the previous or next chevron names the new month in the
       * title at the lift. In the same frame the grid starts one page on
       * `paging.animatedScroll`, a 0.3 s sinusoid.
       * @source measured: UIKit lab, iOS 26.2 simulator, `.date` `.inline`,
       *   a tap on Next: the title changed in the first frame after the
       *   lift and the offset ran 960 → 1280 on the 0.3 s sinusoid from that
       *   frame (9.67, 21.33, 80, 160, 240, 298.67, 317.67 pt at 33, 50, 100,
       *   150, 200, 250, 284 ms), Oct 23 2026
       */
      step: 'animatedScroll',
      /**
       * A second tap while the grid still scrolls names the month after that
       * at once. A new 0.3 s sinusoid starts toward it from where the grid
       * is, from rest.
       * @source measured: UIKit lab, iOS 26.2 simulator, `.date` `.inline`,
       *   two taps on Next 150 ms apart: the title jumped two months, the
       *   offset held one frame at 1092.33 and then ran to 1600 on a fresh
       *   0.3 s sinusoid (4, 59.33, 253.67, 448.33, 503.67 pt at 17, 67, 150,
       *   233, 283 ms), Oct 23 2026
       */
      retarget: 'fromPresentation',
      /**
       * In the first or last month the bounds allow, the chevron toward the
       * outside is disabled, not hidden. It stays in place, a touch on it
       * changes nothing, and its glyph takes the tertiary label colour.
       * @source measured: UIKit lab, iOS 26.2 simulator, `.date` `.inline`
       *   at `maximumDate`'s month: the Next button in place with opacity 1
       *   and `isEnabled` false, a tap on it landing on
       *   `_UICalendarHeaderView` and changing nothing, its glyph tinted
       *   rgba(0.235, 0.235, 0.263, 0.298) (#C5C5C7 on white) while the
       *   button's tintColor stays the accent, Oct 23 2026 and Oct 24 2026
       */
      atBound: 'disabled',
    },
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
