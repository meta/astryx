// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useCalendarDays.ts
 * @input Uses React useMemo, useLocale, PlainDate utilities, generated CLDR weekday data
 * @output Exports useCalendarDays hook for generating calendar day grids
 * @position Calendar-specific hook; used by Calendar
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
  const locale = useLocale();

  // Calculate grid structure
  const gridInfo = useMemo(() => {
    const totalDaysInMonth = getDaysInMonth(year, month);

    // Calculate starting offset based on weekStartsOn
    let startingDayOfWeek =
      plainDateDayOfWeek({year, month, day: 1}) - weekStartsOn;
    if (startingDayOfWeek < 0) {
      startingDayOfWeek += 7;
    }

    // Calculate total cells
    const totalDays = totalDaysInMonth + startingDayOfWeek;
    const totalRows = hasVariableRowCount ? Math.ceil(totalDays / 7) : 6;
    const totalCells = totalRows * 7;

    return {
      daysInMonth: totalDaysInMonth,
      startingDayOfWeek,
      totalCells,
    };
  }, [year, month, weekStartsOn, hasVariableRowCount]);

  const dayNames = useMemo(
    () => getWeekdayHeaderNames(locale, weekStartsOn),
    [locale, weekStartsOn],
  );

  // Generate days array
  const days = useMemo(() => {
    const {
      daysInMonth: totalDaysInMonth,
      startingDayOfWeek,
      totalCells,
    } = gridInfo;
    const firstOfMonth: PlainDate = {year, month, day: 1};
    const result: CalendarDay[] = [];

    for (let i = 0; i < totalCells; i++) {
      const dayOffset = i - startingDayOfWeek + 1;
      const isOutside = dayOffset < 1 || dayOffset > totalDaysInMonth;
      const pd: PlainDate = isOutside
        ? plainDateAddDays(firstOfMonth, dayOffset - 1)
        : {year, month, day: dayOffset};

      result.push({
        date: pd,
        iso: plainDateToISO(pd),
        isOutside,
        dayNumber: pd.day,
      });
    }

    return result;
  }, [year, month, gridInfo]);

  // Group days into weeks
  const weeks = useMemo(() => {
    const result: CalendarDay[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      result.push(days.slice(i, i + 7));
    }
    return result;
  }, [days]);

  return {
    days,
    weeks,
    dayNames,
    totalCells: gridInfo.totalCells,
  };
}
