// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createISODateTimeString.ts
 * @input A string from storage, an API, or a URL
 * @output Exports createISODateTimeString, the validating constructor for ISODateTimeString
 * @position Public utility next to DateTimeInput; re-exported by ./index.ts
 *
 * SYNC: When modified, update this header
 */

import {getDaysInMonth} from '../utils/plainDate';
import {createISOTimeString} from '../utils/timeParser';
import type {ISODateTimeString} from './DateTimeInput';

/**
 * Validates and creates an ISODateTimeString from a string.
 * Returns null if the string is not a valid local date-time.
 *
 * Accepts "YYYY-MM-DDTHH:MM" or "YYYY-MM-DDTHH:MM:SS", with surrounding
 * whitespace. The date must exist in the calendar. The time follows
 * createISOTimeString: one- or two-digit fields, and a seconds fraction is
 * dropped. A time zone suffix ("Z", "+02:00") is rejected, because
 * DateTimeInput holds a wall-clock value with no zone.
 *
 * @example
 * ```ts
 * createISODateTimeString('2026-01-28T14:30'); // '2026-01-28T14:30'
 * createISODateTimeString('2026-02-30T14:30'); // null
 * ```
 */
export function createISODateTimeString(
  value: string,
): ISODateTimeString | null {
  if (typeof value !== 'string') {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\S+)$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const [, year, month, day, timePart] = match;
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  if (
    monthNumber < 1 ||
    monthNumber > 12 ||
    dayNumber < 1 ||
    dayNumber > getDaysInMonth(Number(year), monthNumber)
  ) {
    return null;
  }
  const time = createISOTimeString(timePart);
  if (!time) {
    return null;
  }
  return `${year}-${month}-${day}T${time}` as ISODateTimeString;
}
