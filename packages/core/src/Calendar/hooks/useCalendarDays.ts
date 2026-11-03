// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useCalendarDays.ts
 * @input Uses React useMemo, useLocale, PlainDate and calendar-system
 *   utilities, generated CLDR weekday data
 * @output Exports useCalendarDays (a Gregorian month) and useCalendarMonthDays
 *   (a month of any calendar system) for generating calendar day grids
 * @position Calendar-specific hooks; useCalendarMonthDays is used by Calendar
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Calendar/hooks/index.ts
 */

import {useMemo} from 'react';
import type {DayOfWeek, ISODateString} from '../../utils/dateTypes';
import {
  type PlainDate,
  plainDateToISO,
  getDaysInMonth,
  plainDateDayOfWeek,
  plainDateAddDays,
} from '../../utils/plainDate';
import {useLocale} from '../../i18n';
import {getWeekdayHeaderNames} from '../getWeekdayHeaderNames';
import {
  type CalendarMonth,
  type CalendarSystem,
  calendarDayOfMonth,
} from '../../utils/calendarSystem';

/**
 * Represents a single day in the calendar grid.
 */
export interface CalendarDay {
  /** The PlainDate for this day */
  date: PlainDate;
  /** ISO date string (YYYY-MM-DD) */
  iso: ISODateString;
  /** Whether this day is outside the current month */
  isOutside: boolean;
  /** The day number (1-31) */
  dayNumber: number;
}

/**
 * Configuration for calendar days generation
 */
export interface UseCalendarDaysOptions {
  /** The year to generate days for */
  year: number;
  /** The month (1-based: 1 = January, 12 = December) */
  month: number;
  /** First day of week (0=Sunday through 6=Saturday) */
  weekStartsOn?: DayOfWeek;
  /** Use variable rows per month vs. fixed 6-row grid */
  hasVariableRowCount?: boolean;
}

/**
 * Return type for useCalendarDays hook
 */
export interface UseCalendarDaysReturn {
  /** All days in the grid (includes outside days) */
  days: CalendarDay[];
  /** Days grouped into weeks */
  weeks: CalendarDay[][];
  /** Localized day names for the header */
  dayNames: string[];
  /** Total number of cells in the grid */
  totalCells: number;
}

/**
 * Hook for generating calendar day grids.
 *
 * Calculates all the days to display for a given month, including
 * days from adjacent months to fill the grid.
 *
 * @example
 * ```
 * const {days, weeks, dayNames} = useCalendarDays({
 *   year: 2026,
 *   month: 1, // January (1-based)
 *   weekStartsOn: 0, // Sunday
 * });
 * // days[i].date is a PlainDate { year, month (1-based), day }
 * ```
 */
export function useCalendarDays(
  options: UseCalendarDaysOptions,
): UseCalendarDaysReturn {
  const {year, month, weekStartsOn = 0, hasVariableRowCount = false} = options;
  const days = useMemo(
    () =>
      layOutMonthDays({
        first: {year, month, day: 1},
        length: getDaysInMonth(year, month),
        weekStartsOn,
        hasVariableRowCount,
        dayNumberOf: pd => pd.day,
      }),
    [year, month, weekStartsOn, hasVariableRowCount],
  );
  return useMonthGrid(days, weekStartsOn);
}

/** Configuration for the day grid of one month of a calendar system. */
export interface UseCalendarMonthDaysOptions {
  /** The month to lay out, located by its Gregorian days. */
  month: CalendarMonth;
  /** The calendar system the month belongs to; it numbers the days. */
  calendar: CalendarSystem;
  /** First day of week (0=Sunday through 6=Saturday) */
  weekStartsOn?: DayOfWeek;
  /** Use variable rows per month vs. fixed 6-row grid */
  hasVariableRowCount?: boolean;
}

/**
 * The day grid of one month of any calendar system. Each day keeps its
 * Gregorian date; `dayNumber` is its day of the calendar month. Internal to
 * Calendar.
 */
export function useCalendarMonthDays(
  options: UseCalendarMonthDaysOptions,
): UseCalendarDaysReturn {
  const {
    month,
    calendar,
    weekStartsOn = 0,
    hasVariableRowCount = false,
  } = options;
  const days = useMemo(
    () =>
      layOutMonthDays({
        first: month.start,
        length: month.length,
        weekStartsOn,
        hasVariableRowCount,
        dayNumberOf: (pd, offset) =>
          offset >= 0 && offset < month.length
            ? offset + 1
            : calendarDayOfMonth(calendar, pd),
      }),
    [month, calendar, weekStartsOn, hasVariableRowCount],
  );
  return useMonthGrid(days, weekStartsOn);
}

interface MonthLayout {
  first: PlainDate;
  length: number;
  weekStartsOn: DayOfWeek;
  hasVariableRowCount: boolean;
  /** The day number of a grid day, given its offset from the month's first day. */
  dayNumberOf: (pd: PlainDate, offset: number) => number;
}

function layOutMonthDays(layout: MonthLayout): CalendarDay[] {
  const {first, length, weekStartsOn, hasVariableRowCount, dayNumberOf} =
    layout;
  let startingDayOfWeek = plainDateDayOfWeek(first) - weekStartsOn;
  if (startingDayOfWeek < 0) {
    startingDayOfWeek += 7;
  }
  const totalRows = hasVariableRowCount
    ? Math.ceil((length + startingDayOfWeek) / 7)
    : 6;
  const result: CalendarDay[] = [];
  for (let i = 0; i < totalRows * 7; i++) {
    const offset = i - startingDayOfWeek;
    const pd = plainDateAddDays(first, offset);
    result.push({
      date: pd,
      iso: plainDateToISO(pd),
      isOutside: offset < 0 || offset >= length,
      dayNumber: dayNumberOf(pd, offset),
    });
  }
  return result;
}

function useMonthGrid(
  days: CalendarDay[],
  weekStartsOn: DayOfWeek,
): UseCalendarDaysReturn {
  const locale = useLocale();

  const dayNames = useMemo(
    () => getWeekdayHeaderNames(locale, weekStartsOn),
    [locale, weekStartsOn],
  );

  const weeks = useMemo(() => {
    const result: CalendarDay[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      result.push(days.slice(i, i + 7));
    }
    return result;
  }, [days]);

  return {days, weeks, dayNames, totalCells: days.length};
}
