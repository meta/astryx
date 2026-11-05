// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file getInitialFocusDate.ts
 * @input PlainDate and calendar-system utilities, min/max bounds, today
 * @output Exports getInitialFocusDate — the month Calendar opens on
 * @position Calendar-specific helper; used by Calendar.tsx
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Calendar/getInitialFocusDate.test.ts
 * - /packages/core/src/Calendar/Calendar.tsx (the only caller)
 */

import type {ISODateString, DateRange} from '../utils/dateTypes';
import {
  type PlainDate,
  plainDateFromISO,
  plainDateIsBefore,
  plainDateIsAfter,
} from '../utils/plainDate';
import {
  type CalendarSystem,
  calendarAddMonths,
  calendarMonthOf,
} from '../utils/calendarSystem';

export interface InitialFocusDateOptions {
  /** Controlled visible month, if the consumer supplied one. */
  focusDate?: ISODateString;
  /** Selected value (single date or range), controlled or uncontrolled. */
  value?: ISODateString | DateRange;
  /** Earliest selectable date. */
  min?: ISODateString;
  /** Latest selectable date. */
  max?: ISODateString;
  /** How many month panes the calendar renders (1 or 2). */
  numberOfMonths: number;
  /** Today, injected so the caller keeps a single memoized source of "now". */
  today: PlainDate;
  /** The calendar system whose months the panes show. Default: `gregory`. */
  calendar?: CalendarSystem;
}

/**
 * Picks the date whose month the calendar opens on.
 *
 * An explicit `focusDate` wins, then the selected value — both are the
 * consumer's own instruction about where to look, so neither is second-guessed
 * against `min`/`max`.
 *
 * Otherwise the calendar opens on today, clamped into the `min`/`max` window.
 * Without the clamp a window that doesn't contain today (a 2019 audit range, a
 * booking window opening next spring) opened on today's month with every day
 * disabled, leaving prev/next clicking as the only way in.
 *
 * When clamping forward to `min`, that month leads: the whole selectable window
 * runs ahead of it. When clamping back to `max`, the last pane lands on `max`'s
 * month instead — with `numberOfMonths={2}` opening on `[max, max + 1]` would
 * spend half the calendar on a month that is entirely out of bounds. That
 * shift never crosses `min`'s month.
 */
export function getInitialFocusDate(
  options: InitialFocusDateOptions,
): PlainDate {
  const {
    focusDate,
    value,
    min,
    max,
    numberOfMonths,
    today,
    calendar = 'gregory',
  } = options;

  if (focusDate) {
    return plainDateFromISO(focusDate);
  }

  if (value) {
    return plainDateFromISO(typeof value === 'string' ? value : value.start);
  }

  const minDate = min ? plainDateFromISO(min) : null;
  const maxDate = max ? plainDateFromISO(max) : null;

  if (minDate && plainDateIsBefore(today, minDate)) {
    return minDate;
  }

  if (maxDate && plainDateIsAfter(today, maxDate)) {
    const lastPaneOffset = Math.max(0, numberOfMonths - 1);
    const shifted = calendarAddMonths(
      calendar,
      calendarMonthOf(calendar, maxDate),
      -lastPaneOffset,
    ).start;
    if (
      minDate &&
      plainDateIsBefore(shifted, calendarMonthOf(calendar, minDate).start)
    ) {
      return minDate;
    }
    return shifted;
  }

  return today;
}
