// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file dateTypes.ts
 * @input None
 * @output Shared date type definitions used across Calendar, DateInput, and other components
 * @position Core type definitions; imported by Calendar, DateInput, DateRangeInput, DateTimeInput, plainDate, dateParser
 */

/**
 * ISO 8601 date string in YYYY-MM-DD format.
 * Example: "2026-01-28"
 */
export type ISODateString =
  `${number}${number}${number}${number}-${number}${number}-${number}${number}`;

/** Day of week: 0 = Sunday through 6 = Saturday */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Three-letter lowercase weekday name, 'sun' through 'sat'.
 * A more self-documenting alternative to the numeric {@link DayOfWeek}.
 */
export type DayOfWeekName =
  'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

/** Weekday names indexed by {@link DayOfWeek} (0 = Sunday). */
const WEEKDAY_NAMES: ReadonlyArray<DayOfWeekName> = [
  'sun',
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
];

/**
 * Normalize a weekday to its numeric {@link DayOfWeek}. Accepts either a
 * number (0–6) or a three-letter day name ('sun'–'sat', case-insensitive),
 * so APIs like `weekStartsOn` can take whichever is more readable at the
 * call site. Unrecognized values fall back to 0 (Sunday).
 */
export function normalizeDayOfWeek(
  value: DayOfWeek | DayOfWeekName,
): DayOfWeek {
  if (typeof value === 'number') {
    return value;
  }
  const index = WEEKDAY_NAMES.indexOf(value.toLowerCase() as DayOfWeekName);
  return index === -1 ? 0 : (index as DayOfWeek);
}

/** Immutable date record with 1-based month. */
export interface PlainDate {
  readonly year: number;
  /** 1-based (1 = January, 12 = December) */
  readonly month: number;
  readonly day: number;
}

/** Date range with start and end dates */
export interface DateRange {
  start: ISODateString;
  end: ISODateString;
}
