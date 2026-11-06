// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file formatInstant.ts
 * @input A Date, one absolute format name, an optional time zone and calendar
 * @output That instant rendered as a string
 * @position Leaf shared by Timestamp's visible text and each of its tooltip
 *   lines; owns every absolute format Timestamp can produce
 *
 * Timestamp renders the same instant on two surfaces — the visible text and,
 * on hover, one line per configured time zone. They differ only in which zone
 * they name and whether they carry a zone abbreviation, so they are one
 * formatter parameterized by zone rather than two switches that have to be
 * kept in step by hand. Adding a member to `TimestampFormat` now fails to
 * compile in exactly one place.
 *
 * Each caller keeps its own policy for the zone abbreviation: the visible text
 * takes it straight from the `isTimezoneShown` prop, a tooltip line derives it
 * from how many zones are on screen (see tooltipEntries.ts). Only the
 * rendering is shared, not the decision.
 *
 * Omitting `timeZone` means the viewer's own zone. That path hands `Intl` no
 * `timeZone` and keeps `system_*` on plain `Date` getters, so it produces
 * exactly what it produced before this module existed.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Timestamp/Timestamp.tsx
 * - /packages/core/src/Timestamp/tooltipEntries.ts
 * - /packages/core/src/Timestamp/Timestamp.test.tsx
 */

import {SHARED_DATE_FORMAT_OPTIONS, getWallClock} from '../utils/plainDate';
import {
  formatCalendarInstant,
  type CalendarSystem,
} from '../utils/calendarSystem';
import type {Locale} from '../i18n/types';
import type {TimestampFormat} from './Timestamp';

// =============================================================================
// Types
// =============================================================================

/**
 * Every format that names a fixed instant, plus `'full'` — the long absolute
 * style ("February 19, 2026 at 5:00:00 PM UTC") that backs a relative
 * timestamp's accessible name and the tooltip's default line.
 *
 * `'relative'`, `'relative_short'`, and `'auto'` are excluded: a relative
 * phrase names no instant, so a zone could not change what it says.
 */
export type InstantFormat =
  Exclude<TimestampFormat, 'relative' | 'relative_short' | 'auto'> | 'full';

export interface FormatInstantOptions {
  /**
   * IANA time zone identifier. Omit for the viewer's own zone — which is what
   * `Intl` already does with no `timeZone`, so the omitted path never
   * constructs an explicit-zone formatter and cannot drift from the host
   * default.
   *
   * Must already be one the platform accepts. An identifier `Intl` does not
   * recognize throws a `RangeError` from its constructor, before any
   * formatting happens; deciding what to do about that belongs to whoever
   * took the identifier from a consumer, not here (tooltipEntries resolves
   * and warns in `resolveTimezoneID`, then passes only what survived).
   */
  timeZone?: string;
  /**
   * Whether to append the zone abbreviation. Honoured by `date_time` and
   * `time` only: `'full'` always carries one because that is the style, and
   * the `system_*` shapes never do — a trailing "PST" would break anything
   * parsing them, which is why `isTimezoneShown` has never applied to them.
   * @default false
   */
  isTimezoneShown?: boolean;
  /**
   * How the zone name is spelled when a format carries one. `'short'` is the
   * abbreviation ("PST"); `'long'` spells it out ("Pacific Standard Time").
   * Only `'full'` honours it — it is the one format that always names its zone.
   * The spelled-out form backs a relative timestamp's accessible name, where an
   * abbreviation reads as an unexpanded initialism to a screen reader
   * (WCAG 3.1.4); every visible surface keeps the abbreviation.
   * @default 'short'
   */
  timeZoneNameStyle?: 'short' | 'long';
  /**
   * The calendar that date-bearing formats write the date in. Timestamp
   * passes its resolved calendar. `time` has no date, and the `system_*`
   * shapes and `unix_seconds` stay Gregorian ISO or calendar-neutral in every
   * calendar.
   * @default 'gregory'
   */
  calendar?: CalendarSystem;
}

// =============================================================================
// Option bags
// =============================================================================

/** The long absolute style, with seconds and a zone name. */
const FULL_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  timeZoneName: 'short',
};

/** The time-of-day part, shared by `time` and `date_time`. */
const TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: 'numeric',
  minute: '2-digit',
};

/**
 * The date part here is spelled out rather than taken from
 * `SHARED_DATE_FORMAT_OPTIONS.date`. That bag is shared with DateInput, and
 * pointing `date_time` at it would mean a change made for date-only fields
 * silently reshaped every date-and-time reading too. The two agree today; they
 * are not the same decision.
 */
const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  ...TIME_OPTIONS,
};

// =============================================================================
// Formatting
// =============================================================================

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * The long name of the zone an instant is shown in ("Pacific Standard Time"),
 * in the viewer's zone when no `timeZone` is given.
 */
export function formatZoneName(
  date: Date,
  locale: Locale,
  timeZone?: string,
): string {
  return (
    new Intl.DateTimeFormat(locale, {
      timeZoneName: 'long',
      ...(timeZone === undefined ? {} : {timeZone}),
    })
      .formatToParts(date)
      .find(part => part.type === 'timeZoneName')?.value ?? ''
  );
}

/**
 * Renders one instant in one absolute format.
 *
 * Pure: the same arguments always produce the same string for the requested
 * locale (and, when no `timeZone` is given, host zone).
 */
export function formatInstant(
  date: Date,
  format: InstantFormat,
  locale: Locale,
  {
    timeZone,
    isTimezoneShown = false,
    timeZoneNameStyle = 'short',
    calendar = 'gregory',
  }: FormatInstantOptions = {},
): string {
  const zone = timeZone === undefined ? {} : {timeZone};
  const zoneName = isTimezoneShown ? {timeZoneName: 'short' as const} : {};

  switch (format) {
    case 'full':
      return formatCalendarInstant(
        calendar,
        date,
        {...FULL_OPTIONS, timeZoneName: timeZoneNameStyle},
        locale,
        timeZone,
      );

    case 'date':
      return formatCalendarInstant(
        calendar,
        date,
        SHARED_DATE_FORMAT_OPTIONS.date,
        locale,
        timeZone,
      );

    case 'date_long':
      return formatCalendarInstant(
        calendar,
        date,
        SHARED_DATE_FORMAT_OPTIONS.date_long,
        locale,
        timeZone,
      );

    case 'date_weekday':
      return formatCalendarInstant(
        calendar,
        date,
        SHARED_DATE_FORMAT_OPTIONS.date_weekday,
        locale,
        timeZone,
      );

    case 'date_time':
      return formatCalendarInstant(
        calendar,
        date,
        {...DATE_TIME_OPTIONS, ...zoneName},
        locale,
        timeZone,
      );

    case 'time':
      return new Intl.DateTimeFormat(locale, {
        ...TIME_OPTIONS,
        ...zoneName,
        ...zone,
      }).format(date);

    case 'system_date': {
      const w = getWallClock(date, timeZone);
      return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
    }

    case 'system_date_time': {
      const w = getWallClock(date, timeZone);
      return `${w.year}-${pad(w.month)}-${pad(w.day)} ${pad(w.hour)}:${pad(w.minute)}:${pad(w.second)}`;
    }

    case 'system_time': {
      const w = getWallClock(date, timeZone);
      return `${pad(w.hour)}:${pad(w.minute)}:${pad(w.second)}`;
    }

    case 'unix_seconds':
      // Unix time in whole seconds since the epoch. The epoch is an absolute
      // instant, so this is zone-independent — `timeZone` is intentionally
      // ignored (a wall-clock zone can't change how many seconds have elapsed).
      return String(Math.floor(date.getTime() / 1000));
  }
}
