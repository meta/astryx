// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useCalendarNavigation.ts
 * @input Uses React useState, useMemo, useCallback, useLocale, PlainDate utilities
 * @output Exports useCalendarNavigation hook for month navigation
 * @position Calendar-specific hook; used by Calendar
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
  plainDateSetFirstOfMonth,
  plainDateAddMonths,
  plainDateAddDays,
} from '../../utils/plainDate';
import {plainDateFormatStandaloneMonthYear} from '../../utils/plainDate';
import {useLocale} from '../../i18n';

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
}

/**
 * Return type for useCalendarNavigation hook
 */
export interface UseCalendarNavigationReturn {
  /** The base month (first day of the focus month) as a PlainDate */
  baseMonth: PlainDate;
  /** Array of visible months to render as PlainDates */
  visibleMonths: PlainDate[];
  /** Formatted label for the month header */
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
  } = options;
  const locale = useLocale();

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

  // Base month (first day of focus month)
  const baseMonth = useMemo(() => {
    return plainDateSetFirstOfMonth(focusDate);
  }, [focusDate]);

  // Generate visible months
  const visibleMonths = useMemo(() => {
    return Array.from({length: numberOfMonths}, (_, i) => {
      return plainDateAddMonths(baseMonth, i);
    });
  }, [baseMonth, numberOfMonths]);

  // Format month header
  // Each month is its own stand-alone label (Calendar FR1).
  const monthYearLabel = useMemo(
    () =>
      visibleMonths
        .map(m => plainDateFormatStandaloneMonthYear(m, locale))
        .join(' – '),
    [visibleMonths, locale],
  );

  // Navigate to previous/next month
  const navigateMonth = useCallback(
    (delta: number, focusedDate?: ISODateString, offset?: number) => {
      const newMonth = plainDateAddMonths(baseMonth, delta);
      const newISO = plainDateToISO(newMonth);

      // Calculate target focus date if provided
      if (focusedDate) {
        const currentDate = plainDateFromISO(focusedDate);
        // Use the provided offset (1 for horizontal, 7 for vertical)
        const daysToMove = offset ?? 7;
        const targetDate = plainDateAddDays(currentDate, delta * daysToMove);
        setPendingFocus(plainDateToISO(targetDate));
      }

      if (onFocusDateChange) {
        onFocusDateChange(newISO);
      } else {
        setInternalFocusDate(newMonth);
      }
    },
    [baseMonth, onFocusDateChange],
  );

  // Clear pending focus
  const clearPendingFocus = useCallback(() => {
    setPendingFocus(null);
  }, []);

  return {
    baseMonth,
    visibleMonths,
    monthYearLabel,
    navigateMonth,
    pendingFocus,
    clearPendingFocus,
  };
}
