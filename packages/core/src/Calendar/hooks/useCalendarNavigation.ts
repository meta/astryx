// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useCalendarNavigation.ts
 * @input Uses React useState, useMemo, useCallback, useLocale, PlainDate and
 *   calendar-system utilities
 * @output Exports useCalendarNavigation hook for month navigation in any
 *   calendar system (Gregorian by default)
 * @position Calendar-specific public hook
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Calendar/hooks/index.ts
 */

import {useState, useMemo, useCallback} from 'react';
import type {ISODateString} from '../../utils/dateTypes';
import {
  type PlainDate,
  plainDateFromISO,
  plainDateToISO,
  plainDateToday,
  plainDateAddDays,
} from '../../utils/plainDate';
import {
  type CalendarSystem,
  calendarAddMonths,
  calendarMonthOf,
  calendarYearMonthOf,
  formatCalendarMonthLabel,
} from '../../utils/calendarSystem';
import {useLocale} from '../../i18n';
import {resolveShownCalendar} from '../../i18n/useCalendarSystem';

/**
 * Configuration for calendar navigation
 */
export interface UseCalendarNavigationOptions {
  /** Initial value to determine starting month */
  initialValue?: ISODateString;
  /** Controlled focus date (which month is visible) */
  focusDate?: ISODateString;
  /** Callback when visible month changes */
  onFocusDateChange?: (focusDate: ISODateString) => void;
  /** Number of months to display */
  numberOfMonths?: 1 | 2;
  /**
   * The calendar system whose months the hook steps and labels. Dates stay
   * Gregorian ISO. The hook never reads the InternationalizationProvider
   * calendar. Calendars other than gregory, iso8601, buddhist, roc, and
   * japanese need Temporal; without it, the hook steps Gregorian months and
   * warns once in development.
   * @default 'gregory'
   */
  calendar?: CalendarSystem;
}

/**
 * Return type for useCalendarNavigation hook
 */
export interface UseCalendarNavigationReturn {
  /** The Gregorian first day of the focus month */
  baseMonth: PlainDate;
  /** The Gregorian first day of each visible month */
  visibleMonths: PlainDate[];
  /**
   * The year and month numbers of each visible month in `calendar`, as
   * `useCalendarDays` reads them with the same `calendar`
   */
  visibleCalendarMonths: {year: number; month: number}[];
  /** Formatted label for the month header, in `calendar` */
  monthYearLabel: string;
  /** Navigate to previous/next month */
  navigateMonth: (
    delta: number,
    focusedDate?: ISODateString,
    offset?: number,
  ) => void;
  /** Target date to focus after navigation */
  pendingFocus: ISODateString | null;
  /** Clear the pending focus */
  clearPendingFocus: () => void;
}

/**
 * Hook for managing calendar month navigation.
 *
 * Handles the current focus date (which month is visible), previous/next
 * navigation, and pending focus for keyboard navigation across months.
 *
 * @example
 * ```
 * const {
 *   visibleMonths,
 *   monthYearLabel,
 *   navigateMonth,
 *   pendingFocus,
 *   clearPendingFocus,
 * } = useCalendarNavigation({
 *   initialValue: '2026-01-15',
 *   numberOfMonths: 1,
 * });
 *
 * // Navigate to next month
 * navigateMonth(1);
 *
 * // Navigate from arrow key (with focus tracking)
 * navigateMonth(1, focusedDate, 1); // horizontal offset
 * navigateMonth(1, focusedDate, 7); // vertical offset
 *
 * // Persian months, laid out by useCalendarDays
 * const nav = useCalendarNavigation({initialValue, calendar: 'persian'});
 * const {weeks} = useCalendarDays({
 *   ...nav.visibleCalendarMonths[0],
 *   calendar: 'persian',
 * });
 * ```
 */
export function useCalendarNavigation(
  options: UseCalendarNavigationOptions,
): UseCalendarNavigationReturn {
  const {
    initialValue,
    focusDate: focusDateProp,
    onFocusDateChange,
    numberOfMonths = 1,
    calendar: calendarOption = 'gregory',
  } = options;
  const locale = useLocale();
  const calendar = resolveShownCalendar(
    calendarOption,
    'useCalendarNavigation',
  );

  // Pending focus target after month navigation
  const [pendingFocus, setPendingFocus] = useState<ISODateString | null>(null);

  // Internal focus date state (PlainDate)
  const [internalFocusDate, setInternalFocusDate] = useState<PlainDate>(() => {
    if (focusDateProp) {
      return plainDateFromISO(focusDateProp);
    }
    if (initialValue) {
      return plainDateFromISO(initialValue);
    }
    return plainDateToday();
  });

  // Determine if focus is controlled
  const isControlledFocus =
    focusDateProp !== undefined && onFocusDateChange !== undefined;
  const focusDate: PlainDate = isControlledFocus
    ? plainDateFromISO(focusDateProp)
    : internalFocusDate;

  // A controlled focus date is a new object on each render. Key the memo on
  // its ISO string.
  const focusIso = plainDateToISO(focusDate);
  const shownMonths = useMemo(() => {
    const first = calendarMonthOf(calendar, plainDateFromISO(focusIso));
    return Array.from({length: numberOfMonths}, (_, i) =>
      calendarAddMonths(calendar, first, i),
    );
  }, [calendar, focusIso, numberOfMonths]);

  const visibleMonths = useMemo(
    () => shownMonths.map(month => month.start),
    [shownMonths],
  );
  const baseMonth = visibleMonths[0];

  const visibleCalendarMonths = useMemo(
    () => shownMonths.map(month => calendarYearMonthOf(calendar, month)),
    [calendar, shownMonths],
  );

  // Each month is its own stand-alone label.
  const monthYearLabel = useMemo(
    () =>
      shownMonths
        .map(month => formatCalendarMonthLabel(calendar, month, locale))
        .join(' – '),
    [calendar, shownMonths, locale],
  );

  // Navigate to previous/next month
  const navigateMonth = useCallback(
    (delta: number, focusedDate?: ISODateString, offset?: number) => {
      const newMonth = calendarAddMonths(calendar, shownMonths[0], delta).start;
      const newISO = plainDateToISO(newMonth);

      // Calculate target focus date if provided
      if (focusedDate) {
        const currentDate = plainDateFromISO(focusedDate);
        // Use the provided offset (1 for horizontal, 7 for vertical)
        const daysToMove = offset ?? 7;
        const targetDate = plainDateAddDays(currentDate, delta * daysToMove);
        setPendingFocus(plainDateToISO(targetDate));
      }

      onFocusDateChange?.(newISO);
      if (!isControlledFocus) {
        setInternalFocusDate(newMonth);
      }
    },
    [calendar, shownMonths, isControlledFocus, onFocusDateChange],
  );

  // Clear pending focus
  const clearPendingFocus = useCallback(() => {
    setPendingFocus(null);
  }, []);

  return {
    baseMonth,
    visibleMonths,
    visibleCalendarMonths,
    monthYearLabel,
    navigateMonth,
    pendingFocus,
    clearPendingFocus,
  };
}
