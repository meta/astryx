// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file dateParser.ts
 * @input Uses Intl.DateTimeFormat for locale detection
 * @output Exports date parsing utilities for user input
 * @position Core utility; used by DateInput, DateTimeInput
 *
 * SYNC: When modified, update:
 * - /packages/core/src/utils/dateParser.test.ts
 * - /packages/core/src/utils/index.ts
 */

import {type PlainDate, plainDateCreate, plainDateFromDate} from './plainDate';
import type {Locale} from '../i18n/types';

export {
  plainDateFromISO as parseISO,
  plainDateToISO as dateToISO,
} from './plainDate';

/**
 * Detects if the locale uses day-first date format (DD/MM/YYYY).
 * US and a few others use month-first (MM/DD/YYYY).
 */
export function isLocaleDayFirst(locale: Locale = 'en'): boolean {
  const parts = new Intl.DateTimeFormat(locale, {
    calendar: 'gregory',
  }).formatToParts(new Date(2000, 0, 15));
  const dayIndex = parts.findIndex(p => p.type === 'day');
  const monthIndex = parts.findIndex(p => p.type === 'month');
  return dayIndex < monthIndex;
}

// Built at run time: a Unicode property escape in a literal fails a source
// build whose Babel lacks the Unicode data.
const LETTER_FREE = new RegExp('^[^\\p{L}]+$', 'u');
const YEAR_FIRST = new RegExp('^\\d{4}[^\\p{L}\\d]', 'u');

/**
 * Parses user input into a PlainDate.
 *
 * Supports ISO dates, English month names, and ASCII numeric dates with or
 * without a year. For ambiguous ASCII numeric input where both fields are at
 * most 12, `locale` selects month-first versus day-first order. It does not
 * localize month-name parsing, accept non-ASCII digits, or provide a general
 * locale-aware parser.
 *
 * @returns PlainDate if valid, null if unparseable
 */
export function parseDateInput(
  input: string,
  locale: Locale = 'en',
): PlainDate | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const currentYear = new Date().getFullYear();

  // 1. Try ISO format first (YYYY-MM-DD) - always unambiguous
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return tryCreatePlainDate(+year, +month, +day);
  }

  // 2. Try full month name formats with year
  // "January 25, 2026" or "Jan 25, 2026"
  const monthFirstWithYearMatch = trimmed.match(
    /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/,
  );
  if (monthFirstWithYearMatch) {
    const [, monthName, day, year] = monthFirstWithYearMatch;
    const month = parseMonthName(monthName);
    if (month !== null) {
      return tryCreatePlainDate(+year, month, +day);
    }
  }

  // "25 January 2026" or "25 Jan 2026"
  const dayFirstWithYearMatch = trimmed.match(
    /^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})$/,
  );
  if (dayFirstWithYearMatch) {
    const [, day, monthName, year] = dayFirstWithYearMatch;
    const month = parseMonthName(monthName);
    if (month !== null) {
      return tryCreatePlainDate(+year, month, +day);
    }
  }

  // 3. Try full month name formats WITHOUT year (defaults to current year)
  // "January 25" or "Jan 25"
  const monthFirstNoYearMatch = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2})$/);
  if (monthFirstNoYearMatch) {
    const [, monthName, day] = monthFirstNoYearMatch;
    const month = parseMonthName(monthName);
    if (month !== null) {
      return tryCreatePlainDate(currentYear, month, +day);
    }
  }

  // "25 January" or "25 Jan"
  const dayFirstNoYearMatch = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)$/);
  if (dayFirstNoYearMatch) {
    const [, day, monthName] = dayFirstNoYearMatch;
    const month = parseMonthName(monthName);
    if (month !== null) {
      return tryCreatePlainDate(currentYear, month, +day);
    }
  }

  // 4. Try numeric formats with separators (/, -, .) WITH year
  const numericWithYearMatch = trimmed.match(
    /^(\d{1,2})([-/.])(\d{1,2})([-/.])(\d{4})$/,
  );
  if (numericWithYearMatch) {
    const [, first, sep1, second, sep2, year] = numericWithYearMatch;

    if (sep1 !== sep2) {
      return null;
    }
    return parseNumericDate(+first, +second, +year, locale);
  }

  // 5. Try numeric formats WITHOUT year (defaults to current year)
  const numericNoYearMatch = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})$/);
  if (numericNoYearMatch) {
    const [, first, second] = numericNoYearMatch;
    return parseNumericDate(+first, +second, currentYear, locale);
  }

  // 6. Fall back to native Date parsing for other formats.
  //
  // Skip bare numeric input (e.g. "0", "1", "01", "2026"). These are
  // in-progress values a user is still typing, not complete dates. Native
  // `Date` parsing coerces them into arbitrary dates ("0" -> year 2000 in V8,
  // year 0 in some engines), which is both surprising and — when the year
  // resolves to 0 — produces an out-of-range date that throws downstream.
  // Treat them as not-yet-a-valid-date instead.
  if (/^\d+$/.test(trimmed)) {
    return null;
  }
  // In a day-first locale, letter-free text that no form above matched is not
  // a date. Native `Date` reads `a/b/c` month first. It also takes a year of
  // one to three digits. So "12/01/2" gives a wrong date. A four-digit year
  // written first is not ambiguous.
  if (
    isLocaleDayFirst(locale) &&
    LETTER_FREE.test(trimmed) &&
    !YEAR_FIRST.test(trimmed)
  ) {
    return null;
  }

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const fromDate = plainDateFromDate(parsed);
    // Validate the result so we never return an out-of-range date (e.g. a
    // year of 0), which would throw when later re-parsed.
    return tryCreatePlainDate(fromDate.year, fromDate.month, fromDate.day);
  }

  return null;
}

function parseNumericDate(
  first: number,
  second: number,
  year: number,
  locale: Locale,
): PlainDate | null {
  let day: number;
  let month: number;

  if (first > 12 && second <= 12) {
    day = first;
    month = second;
  } else if (second > 12 && first <= 12) {
    month = first;
    day = second;
  } else if (first > 12 && second > 12) {
    return null;
  } else {
    if (isLocaleDayFirst(locale)) {
      day = first;
      month = second;
    } else {
      month = first;
      day = second;
    }
  }

  return tryCreatePlainDate(year, month, day);
}

function parseMonthName(name: string): number | null {
  const months: Record<string, number> = {
    january: 1,
    jan: 1,
    february: 2,
    feb: 2,
    march: 3,
    mar: 3,
    april: 4,
    apr: 4,
    may: 5,
    june: 6,
    jun: 6,
    july: 7,
    jul: 7,
    august: 8,
    aug: 8,
    september: 9,
    sep: 9,
    sept: 9,
    october: 10,
    oct: 10,
    november: 11,
    nov: 11,
    december: 12,
    dec: 12,
  };
  return months[name.toLowerCase()] ?? null;
}

function tryCreatePlainDate(
  year: number,
  month: number,
  day: number,
): PlainDate | null {
  try {
    return plainDateCreate(year, month, day);
  } catch {
    return null;
  }
}
