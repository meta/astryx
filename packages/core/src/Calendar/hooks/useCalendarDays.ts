// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useCalendarDays.ts
 * @input Uses React useMemo, useLocale, PlainDate and calendar-system
 *   utilities, generated CLDR weekday data
 * @output Exports useCalendarDays, the day grid of one month of any calendar
 *   system (Gregorian by default)
 * @position Calendar-specific hook; used by Calendar and MonthScroller
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Calendar/hooks/index.ts
 */

import {useMemo} from 'react';
import type {DayOfWeek, ISODateString} from '../../utils/dateTypes';
import {
  type PlainDate,
  plainDateToISO,
  plainDateDayOfWeek,
  plainDateAddDays,
} from '../../utils/plainDate';
import {useLocale} from '../../i18n';
import {getWeekdayHeaderNames} from '../getWeekdayHeaderNames';
import {
  type CalendarSystem,
  calendarDayOfMonth,
  calendarMonthFromYearMonth,
} from '../../utils/calendarSystem';
import {resolveShownCalendar} from '../../i18n/useCalendarSystem';

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
  /** The year to generate days for, in `calendar`'s numbering */
  year: number;
  /**
   * The month's position in its year (1-based). In the Gregorian calendar,
   * 1 is January and 12 is December. In other calendars it is numbered as
   * `Temporal.PlainDate` numbers it: 1 through 13 in a Hebrew leap year.
   */
  month: number;
  /** First day of week (0=Sunday through 6=Saturday) */
  weekStartsOn?: DayOfWeek;
  /** Use variable rows per month vs. fixed 6-row grid */
  hasVariableRowCount?: boolean;
  /**
   * The calendar system that numbers `year`, `month`, and each `dayNumber`.
   * Each day keeps its Gregorian `date` and `iso`. The hook never reads the
   * InternationalizationProvider calendar. Calendars other than gregory,
   * iso8601, buddhist, roc, and japanese need Temporal; without it, the hook
   * reads Gregorian numbers and warns once in development.
   * @default 'gregory'
   */
  calendar?: CalendarSystem;
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
 *
 * // Aban 1405 in the Persian calendar; dates stay Gregorian
 * useCalendarDays({year: 1405, month: 8, calendar: 'persian'});
 * ```
 */
export function useCalendarDays(
  options: UseCalendarDaysOptions,
): UseCalendarDaysReturn {
  const {
    year,
    month,
    weekStartsOn = 0,
    hasVariableRowCount = false,
    calendar: calendarOption = 'gregory',
  } = options;
  const calendar = resolveShownCalendar(calendarOption, 'useCalendarDays');
  const days = useMemo(() => {
    const calendarMonth = calendarMonthFromYearMonth(calendar, {year, month});
    return layOutMonthDays({
      first: calendarMonth.start,
      length: calendarMonth.length,
      weekStartsOn,
      hasVariableRowCount,
      dayNumberOf: (pd, offset) =>
        offset >= 0 && offset < calendarMonth.length
          ? offset + 1
          : calendarDayOfMonth(calendar, pd),
    });
  }, [year, month, calendar, weekStartsOn, hasVariableRowCount]);
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
