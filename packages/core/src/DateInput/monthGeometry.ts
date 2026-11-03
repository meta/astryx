// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file monthGeometry.ts
 * @input PlainDate values, a calendar system, scroll offsets, pane heights
 * @output Month-index arithmetic for a calendar and the virtualized pane window
 * @position Internal helper; consumed by the touch date surfaces
 *
 * A "month index" is a single integer that totally orders calendar months. In
 * the Gregorian-aligned calendars it is `year * 12 + (month - 1)`; in the
 * others it counts calendar months from a fixed month, because their years
 * have 12 or 13 months. The scroller is a list of equal-width panes, so one
 * integer converts freely between a month, a row in that list, and a scroll
 * offset — which is the whole trick behind continuous scrolling.
 *
 * These are pure functions on purpose: the scroll math is the part most likely
 * to be wrong, and it is testable without a layout engine.
 *
 * SYNC: When modified, update DateInputTouch.test.tsx.
 */

import type {PlainDate} from '../utils/dateTypes';
import {
  type CalendarMonth,
  type CalendarSystem,
  calendarAddMonths,
  calendarMonthOf,
  calendarMonthOfYear,
  calendarMonthsBetween,
  calendarMonthsInCalendarYear,
  calendarShiftYears,
  calendarYearMonthOf,
  isGregorianAligned,
} from '../utils/calendarSystem';

/** How many months are reachable in either direction when unbounded. */
export const DEFAULT_MONTH_REACH = 600;

/** `year * 12 + (month - 1)`, for a 1-based month. */
export function toMonthIndex(year: number, month: number): number {
  return year * 12 + (month - 1);
}

/** The month index of a PlainDate. */
export function monthIndexOf(date: PlainDate): number {
  return toMonthIndex(date.year, date.month);
}

/** Inverse of {@link toMonthIndex}; month comes back 1-based. */
export function fromMonthIndex(index: number): {year: number; month: number} {
  return {
    year: Math.floor(index / 12),
    month: (((index % 12) + 12) % 12) + 1,
  };
}

/** `value` limited to `[min, max]`. */
export function clampIndex(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * The month a scrollport is resting on (or nearest to, mid-scroll).
 *
 * Returns a row offset from the start of the list, not a month index — add
 * `minMonthIndex` for that.
 *
 * `scrollOffset` is `scrollLeft` for the horizontal scroller. Under RTL that
 * is NEGATIVE — the spec has the inline start at 0 and scrolling run down
 * from there — so the sign is normalized away here rather than at each call
 * site, where forgetting it would silently pin the calendar to month zero.
 */
export function rowAtScrollOffset(
  scrollOffset: number,
  paneSize: number,
  rowCount: number,
  isRTL: boolean = false,
): number {
  if (paneSize <= 0) {
    return 0;
  }
  const distance = isRTL ? -scrollOffset : scrollOffset;
  return clampIndex(Math.round(distance / paneSize), 0, rowCount - 1);
}

/**
 * The scroll offset that brings `row` to rest, ready for `scrollTo`. The
 * inverse of {@link rowAtScrollOffset}, including its RTL sign.
 */
export function scrollOffsetForRow(
  row: number,
  paneSize: number,
  isRTL: boolean = false,
): number {
  const distance = row * paneSize;
  return isRTL ? -distance : distance;
}

export interface PaneWindow {
  /** First rendered row, inclusive. */
  start: number;
  /** Last rendered row, inclusive. */
  end: number;
}

/**
 * The slice of rows to actually mount around `centerRow`.
 *
 * Only a handful of panes exist in the DOM at a time; the rest of the list is
 * a spacer. `overscan` is how many extra panes ride along on each side so a
 * fast fling never lands on an unmounted one — which under `scroll-snap-type:
 * mandatory` would be visible as a jump.
 */
export function paneWindow(
  centerRow: number,
  rowCount: number,
  overscan: number,
): PaneWindow {
  return {
    start: Math.max(0, centerRow - overscan),
    end: Math.min(rowCount - 1, centerRow + overscan),
  };
}

/** `[start, end]` inclusive, as an array of rows. */
export function rowsIn({start, end}: PaneWindow): number[] {
  const rows: number[] = [];
  for (let row = start; row <= end; row++) {
    rows.push(row);
  }
  return rows;
}

/**
 * Month indexes for one calendar. Years and month positions are the ones
 * `calendarYearMonthOf` counts.
 */
export interface MonthModel {
  readonly calendar: CalendarSystem;
  /** The index of the calendar month that contains a date. */
  indexOf: (date: PlainDate) => number;
  /** The calendar month at an index. */
  monthAt: (index: number) => CalendarMonth;
  /** The calendar year of an index and the month's position in it. */
  yearMonthAt: (index: number) => {year: number; month: number};
  /** The index of a month position in a calendar year. */
  indexOfYearMonth: (year: number, month: number) => number;
  /** The number of months in a calendar year. */
  monthsInYear: (year: number) => number;
  /**
   * The index `years` calendar years from `index`, in the same month. A leap
   * month that the target year does not have becomes its common counterpart.
   */
  shiftYears: (index: number, years: number) => number;
}

const GREGORIAN_MONTH_MODELS = new Map<CalendarSystem, MonthModel>();

function gregorianMonthModel(calendar: CalendarSystem): MonthModel {
  let model = GREGORIAN_MONTH_MODELS.get(calendar);
  if (model == null) {
    model = {
      calendar,
      indexOf: monthIndexOf,
      monthAt: index => {
        const {year, month} = fromMonthIndex(index);
        return calendarMonthOfYear(calendar, year, month);
      },
      yearMonthAt: fromMonthIndex,
      indexOfYearMonth: toMonthIndex,
      monthsInYear: () => 12,
      shiftYears: (index, years) => index + years * 12,
    };
    GREGORIAN_MONTH_MODELS.set(calendar, model);
  }
  return model;
}

// The month that holds EPOCH is index 0. Any fixed month works; a recent one
// keeps the indexes of nearby months small.
const EPOCH: PlainDate = {year: 2000, month: 1, day: 1};

function temporalMonthModel(calendar: CalendarSystem): MonthModel {
  const epoch = calendarMonthOf(calendar, EPOCH);
  // Temporal arithmetic is slow next to a render, and the same months are
  // asked for on every render of the panes and the wheels.
  const months = new Map<number, CalendarMonth>();
  const monthAt = (index: number) => {
    let month = months.get(index);
    if (month == null) {
      month = calendarAddMonths(calendar, epoch, index);
      months.set(index, month);
    }
    return month;
  };
  const indexOf = (date: PlainDate) =>
    calendarMonthsBetween(calendar, epoch, calendarMonthOf(calendar, date));
  return {
    calendar,
    indexOf,
    monthAt,
    yearMonthAt: index => calendarYearMonthOf(calendar, monthAt(index).start),
    indexOfYearMonth: (year, month) =>
      indexOf(calendarMonthOfYear(calendar, year, month).start),
    monthsInYear: year => calendarMonthsInCalendarYear(calendar, year),
    shiftYears: (index, years) =>
      indexOf(calendarShiftYears(calendar, monthAt(index).start, years)),
  };
}

/**
 * The month model of a calendar. A calendar that needs Temporal must be
 * available in this runtime; `useCalendarSystem` resolves one that is not to
 * `gregory`.
 */
export function createMonthModel(calendar: CalendarSystem): MonthModel {
  return isGregorianAligned(calendar)
    ? gregorianMonthModel(calendar)
    : temporalMonthModel(calendar);
}
