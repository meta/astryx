// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file plainDate.ts
 * @input ISO date strings, year/month/day numbers
 * @output Immutable PlainDate records and pure date arithmetic
 * @position Shared utility; replaces scattered Date usage across Calendar hooks
 */

import type {ISODateString, PlainDate} from './dateTypes';
import type {Locale} from '../i18n/types';
import {
  formatCalendarDate,
  isCalendarSystem,
  type CalendarSystem,
} from './calendarSystem';
import {firstCharacter} from './characters';
import {standaloneMonthCapitalLanguages} from './standaloneMonthCapitals.generated';

export type {PlainDate} from './dateTypes';

export function plainDateCreate(
  year: number,
  month: number,
  day: number,
): PlainDate {
  if (!Number.isInteger(year) || year < 1) {
    throw new RangeError(`year must be a positive integer, got ${year}`);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`month must be 1–12, got ${month}`);
  }
  const maxDay = getDaysInMonth(year, month);
  if (!Number.isInteger(day) || day < 1 || day > maxDay) {
    throw new RangeError(
      `day must be 1–${maxDay} for ${year}-${String(month).padStart(2, '0')}, got ${day}`,
    );
  }
  return {year, month, day};
}

export function plainDateFromISO(str: ISODateString): PlainDate {
  const [year, month, day] = str.split('-').map(Number);
  return plainDateCreate(year, month, day);
}

export function plainDateToISO(pd: PlainDate): ISODateString {
  const y = String(pd.year).padStart(4, '0');
  const m = String(pd.month).padStart(2, '0');
  const d = String(pd.day).padStart(2, '0');
  return `${y}-${m}-${d}` as ISODateString;
}

export function plainDateToDate(pd: PlainDate): Date {
  // Unlike the Date constructor, setFullYear keeps years 0-99 as given
  // instead of reading them as 1900-1999.
  const d = new Date(0, 0, 1);
  d.setFullYear(pd.year, pd.month - 1, pd.day);
  return d;
}

export function plainDateFromDate(d: Date): PlainDate {
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
  };
}

export function plainDateToday(): PlainDate {
  return plainDateFromDate(new Date());
}

export function getDaysInMonth(year: number, month: number): number {
  if (month === 2) {
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return isLeap ? 29 : 28;
  }
  return [0, 31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month];
}

export function plainDateDayOfWeek(pd: PlainDate): number {
  return plainDateToDate(pd).getDay();
}

export function plainDateAddMonths(pd: PlainDate, n: number): PlainDate {
  // Pure month arithmetic with day clamping (Temporal.PlainDate.add
  // semantics): Jan 31 + 1 month is Feb 28/29, not Mar 2/3. Date#setMonth
  // would overflow the excess days into the following month instead.
  const totalMonths = pd.year * 12 + (pd.month - 1) + n;
  const year = Math.floor(totalMonths / 12);
  const month = (((totalMonths % 12) + 12) % 12) + 1;
  const day = Math.min(pd.day, getDaysInMonth(year, month));
  return {year, month, day};
}

export function plainDateAddDays(pd: PlainDate, n: number): PlainDate {
  const d = plainDateToDate(pd);
  d.setDate(d.getDate() + n);
  return plainDateFromDate(d);
}

/**
 * `Date.UTC` with years 0-99 kept as given; `Date.UTC` itself reads them as
 * 1900-1999.
 */
function utcTime(
  year: number,
  monthIndex: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): number {
  const d = new Date(0);
  d.setUTCFullYear(year, monthIndex, day);
  d.setUTCHours(hour, minute, second);
  return d.getTime();
}

/**
 * Whole calendar days from `a` to `b`, ignoring time of day. Positive when
 * `b` is after `a`, negative when before. Uses UTC midnight so DST shifts
 * never add or drop a day.
 */
export function plainDateDiffDays(a: PlainDate, b: PlainDate): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const aUTC = utcTime(a.year, a.month - 1, a.day);
  const bUTC = utcTime(b.year, b.month - 1, b.day);
  return Math.round((bUTC - aUTC) / msPerDay);
}

/**
 * The wall-clock fields an instant reads as in a given zone.
 *
 * A fixed `'en-US'` locale with `hourCycle: 'h23'` keeps the parts numeric and
 * stable whatever locale the viewer has, so callers can assemble machine
 * shapes (`YYYY-MM-DD`, `HH:mm:ss`) from them. Exported for Timestamp, whose
 * `system_*` formats are built from these fields rather than through `Intl`
 * formatting.
 */
export function getTimeZoneParts(
  instant: number,
  timezoneID: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezoneID,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    calendar: 'gregory',
  }).formatToParts(new Date(instant));

  const lookup = Object.fromEntries(
    parts
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, Number(part.value)]),
  );

  return {
    year: lookup.year,
    month: lookup.month,
    day: lookup.day,
    hour: lookup.hour,
    minute: lookup.minute,
    second: lookup.second,
  };
}

/** The wall-clock fields of an instant: in a zone, or in the viewer's. */
export interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/**
 * Wall-clock fields for an instant, in the named zone or in the viewer's
 * zone (`undefined`, `null` or ""). The zone-less branch reads plain `Date`
 * getters, so the default rendering needs no `Intl` zone data. The explicit
 * return type keeps both branches on one shape.
 */
export function getWallClock(
  date: Date,
  timeZone: string | null | undefined,
): WallClock {
  return !timeZone
    ? {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
        hour: date.getHours(),
        minute: date.getMinutes(),
        second: date.getSeconds(),
      }
    : getTimeZoneParts(date.getTime(), timeZone);
}

function getTimezoneOffsetMS(timezoneID: string, instant: number): number {
  const parts = getTimeZoneParts(instant, timezoneID);
  return (
    utcTime(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    ) - instant
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function plainDateToInstant(
  date: PlainDate,
  timezoneID: string,
  hour = 0,
  minute = 0,
): number {
  // The wall time read as if it were UTC; subtracting an offset gives a
  // candidate instant.
  const wallTime = utcTime(date.year, date.month - 1, date.day, hour, minute);
  // The offsets in effect a day either side cover any transition that can make
  // this wall time skipped or repeated.
  const offsetBefore = getTimezoneOffsetMS(timezoneID, wallTime - DAY_MS);
  const offsetAfter = getTimezoneOffsetMS(timezoneID, wallTime + DAY_MS);
  // Temporal's "compatible" disambiguation (AST-067): a wall time that happens
  // twice resolves to its earlier occurrence, and one that never happens is
  // read in the offset before the transition, which moves it forward by the
  // length of the gap.
  const candidates = [offsetBefore, offsetAfter]
    .map(offset => wallTime - offset)
    .filter(
      (instant, index) =>
        getTimezoneOffsetMS(timezoneID, instant) ===
        (index === 0 ? offsetBefore : offsetAfter),
    );
  return candidates.length > 0
    ? Math.min(...candidates)
    : wallTime - offsetBefore;
}

export function plainDateFromInstant(
  instant: number,
  timezoneID: string,
): PlainDate {
  const parts = getTimeZoneParts(instant, timezoneID);
  return plainDateCreate(parts.year, parts.month, parts.day);
}

function compare(a: PlainDate, b: PlainDate): number {
  if (a.year !== b.year) {
    return a.year - b.year;
  }
  if (a.month !== b.month) {
    return a.month - b.month;
  }
  return a.day - b.day;
}

export function plainDateIsBefore(a: PlainDate, b: PlainDate): boolean {
  return compare(a, b) < 0;
}

export function plainDateIsAfter(a: PlainDate, b: PlainDate): boolean {
  return compare(a, b) > 0;
}

export function plainDateIsEqual(a: PlainDate, b: PlainDate): boolean {
  return compare(a, b) === 0;
}

export function plainDateMax(a: PlainDate, b: PlainDate): PlainDate {
  return compare(a, b) >= 0 ? a : b;
}

export function plainDateMin(a: PlainDate, b: PlainDate): PlainDate {
  return compare(a, b) <= 0 ? a : b;
}

export function plainDateIsInRange(
  pd: PlainDate,
  range: [PlainDate, PlainDate],
): boolean {
  return compare(pd, range[0]) >= 0 && compare(pd, range[1]) <= 0;
}

export interface NearestAcceptedDateOptions {
  min?: PlainDate | null;
  max?: PlainDate | null;
  /** Rejects a date inside the bounds, such as a date constraint. */
  isDateDisabled?: (date: PlainDate) => boolean;
  /** How many days to search on each side of the clamped date. */
  searchDays?: number;
}

/**
 * The date nearest to `target` that a field accepts. It clamps `target` into
 * [`min`, `max`], then searches outward one day at a time, inside the bounds,
 * for a date that `isDateDisabled` allows. On a tie the later date wins. When
 * no date inside the search window is allowed, it returns the clamped date.
 */
export function nearestAcceptedDate(
  target: PlainDate,
  {min, max, isDateDisabled, searchDays = 366}: NearestAcceptedDateOptions,
): PlainDate {
  let clamped = target;
  if (min != null && compare(clamped, min) < 0) {
    clamped = min;
  }
  if (max != null && compare(clamped, max) > 0) {
    clamped = max;
  }
  if (isDateDisabled == null || !isDateDisabled(clamped)) {
    return clamped;
  }
  const isAccepted = (date: PlainDate) =>
    (min == null || compare(date, min) >= 0) &&
    (max == null || compare(date, max) <= 0) &&
    !isDateDisabled(date);
  for (let offset = 1; offset <= searchDays; offset += 1) {
    const later = plainDateAddDays(clamped, offset);
    if (isAccepted(later)) {
      return later;
    }
    const earlier = plainDateAddDays(clamped, -offset);
    if (isAccepted(earlier)) {
      return earlier;
    }
  }
  return clamped;
}

export function plainDateSetFirstOfMonth(pd: PlainDate): PlainDate {
  return {year: pd.year, month: pd.month, day: 1};
}

export function plainDateSetStartOfWeek(
  pd: PlainDate,
  weekStartsOn: number,
): PlainDate {
  const day = plainDateDayOfWeek(pd);
  const delta = (day - weekStartsOn + 7) % 7;
  return plainDateAddDays(pd, -delta);
}

export function plainDateSetEndOfWeekExclusive(
  pd: PlainDate,
  weekStartsOn: number,
): PlainDate {
  return plainDateAddDays(plainDateSetStartOfWeek(pd, weekStartsOn), 7);
}

export function plainDateGetWeekNumber(pd: PlainDate): number {
  // ISO week number: ceil(day-of-year of the week's Thursday / 7). Computed
  // entirely on UTC anchors — the same DST immunity plainDateDiffDays relies
  // on — because mixing local-time instants leaks the host zone's DST offset
  // into the day count. When Jan 1 is a Friday (so every Thursday's day-of-year
  // is an exact multiple of 7), a one-hour offset from a zone whose DST ends
  // after New Year rounds a whole week up: Sydney, Auckland and Santiago users
  // saw week 15 for the week that is ISO week 14. utcTime keeps years 1-99
  // as given, like the other Calendar date helpers.
  const msPerDay = 24 * 60 * 60 * 1000;
  const utcMidnight = utcTime(pd.year, pd.month - 1, pd.day);
  const dayNum = new Date(utcMidnight).getUTCDay() || 7;
  const thursday = utcMidnight + (4 - dayNum) * msPerDay;
  const yearStart = utcTime(new Date(thursday).getUTCFullYear(), 0, 1);
  const dayOfYear = (thursday - yearStart) / msPerDay + 1;
  return Math.ceil(dayOfYear / 7);
}

// e.g. "Wednesday, May 21, 2026" (locale-dependent)
export const DATE_FORMAT_WITH_WEEKDAY: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
};

// e.g. "Wed, May 21, 2026" (locale-dependent) — short weekday + short month.
// Backs the shared `date_weekday` format used by both Timestamp and DateInput.
export const DATE_FORMAT_SHORT_WITH_WEEKDAY: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
};

// e.g. "May 21, 2026" (locale-dependent)
export const DATE_FORMAT_LONG: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
};

// e.g. "January 2026" (locale-dependent)
export const DATE_FORMAT_MONTH_YEAR: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'long',
};

/**
 * The month and year as a label that stands alone, such as a calendar heading
 * or a month grid's name. `Intl` formats the month for running text; where
 * CLDR titlecases a stand-alone month name (its `contextTransforms`), the
 * label starts with a capital, as Calendar's weekday headers use CLDR's
 * stand-alone forms (`component:Calendar` FR1). Internal: not re-exported from
 * `utils/index.ts`.
 */
export function plainDateFormatStandaloneMonthYear(
  pd: PlainDate,
  locale: Locale,
  calendar: Intl.DateTimeFormatOptions['calendar'] = 'gregory',
): string {
  const label = plainDateFormat(
    pd,
    {...DATE_FORMAT_MONTH_YEAR, calendar},
    locale,
  );
  let language: string;
  try {
    language = new Intl.Locale(locale).language;
  } catch {
    return label;
  }
  if (!standaloneMonthCapitalLanguages.has(language)) {
    return label;
  }
  const first = firstCharacter(label);
  return first.toLocaleUpperCase(locale) + label.slice(first.length);
}

// e.g. "Sun" (locale-dependent) — the weekday on its own, abbreviated.
//
// This is CLDR's `abbreviated` width. Weekday headers prefer a generated
// table, because `Intl` has no short width.
export const DATE_FORMAT_WEEKDAY_ONLY: Intl.DateTimeFormatOptions = {
  weekday: 'short',
};

/**
 * The platform's weekday names for a locale, Sunday first, in `Intl`'s
 * `short` width (CLDR's abbreviated) or its `narrow` width. Returns `null`
 * when the platform has no data for the locale's language, so a caller uses
 * its own fallback instead of the host's default locale.
 */
export function plainDateWeekdayNames(
  locale: Locale,
  width: 'short' | 'narrow' = 'short',
): string[] | null {
  const options: Intl.DateTimeFormatOptions = {weekday: width};
  // A language the platform lacks resolves to the host's default locale.
  const resolved = dateTimeFormatFor(locale, {
    ...options,
    calendar: 'gregory',
  }).resolvedOptions().locale;
  if (new Intl.Locale(resolved).language !== new Intl.Locale(locale).language) {
    return null;
  }
  // January 4, 1970 was a Sunday.
  return Array.from({length: 7}, (_, day) =>
    plainDateFormat({year: 1970, month: 1, day: 4 + day}, options, locale),
  );
}

// e.g. "January" (locale-dependent) — the month on its own, for a control
// that shows a list of months and carries the year separately.
export const DATE_FORMAT_MONTH_ONLY: Intl.DateTimeFormatOptions = {
  month: 'long',
};

// e.g. "Jan 25" (locale-dependent)
export const DATE_FORMAT_SHORT: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
};

// e.g. "Jan 25, 2026" (locale-dependent)
export const DATE_FORMAT_SHORT_WITH_YEAR: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
};

/**
 * Format a `PlainDate` for display.
 *
 * The locale defaults to the same `'en'` fallback as `useLocale()`, avoiding
 * runtime-dependent output when no provider locale is available. Astryx date
 * APIs currently model Gregorian dates, so this helper defaults to Gregorian
 * when `options.calendar` is omitted. The explicit option remains supported for
 * compatibility with the public `Intl.DateTimeFormatOptions` signature; it is a
 * display-only escape hatch and does not change PlainDate arithmetic, parsing,
 * serialization, or any Astryx component's calendar semantics. Another
 * calendar names the month and day that Calendar shows in it.
 */
export function plainDateFormat(
  pd: PlainDate,
  options: Intl.DateTimeFormatOptions,
  locale: Locale = 'en',
): string {
  const calendar = options.calendar ?? 'gregory';
  if (calendar !== 'gregory' && isCalendarSystem(calendar)) {
    return formatCalendarDate(calendar, pd, options, locale);
  }
  const [format, date] = plainDateFormatInput(pd, options, locale);
  return format.format(date);
}

/**
 * The parts of `plainDateFormat`'s output, from the same formatter and date.
 * Internal: not re-exported from `utils/index.ts`.
 */
export function plainDateFormatToParts(
  pd: PlainDate,
  options: Intl.DateTimeFormatOptions,
  locale: Locale,
): Intl.DateTimeFormatPart[] {
  const [format, date] = plainDateFormatInput(pd, options, locale);
  return format.formatToParts(date);
}

function plainDateFormatInput(
  pd: PlainDate,
  options: Intl.DateTimeFormatOptions,
  locale: Locale,
): [Intl.DateTimeFormat, Date | number] {
  const calendar = options.calendar ?? 'gregory';
  if (options.timeZone != null) {
    return [
      dateTimeFormatFor(locale, {...options, calendar}),
      plainDateToDate(pd),
    ];
  }
  if (TIME_OF_DAY_FIELDS.some(field => options[field] != null)) {
    // A zone name or a time of day reads local midnight in the zone current
    // at the call. A cached formatter would keep the zone it was built in,
    // so this one is built for the call.
    return [
      new Intl.DateTimeFormat(locale, {...options, calendar}),
      plainDateToDate(pd),
    ];
  }
  // Date fields alone: UTC midnight formatted in UTC, so neither the cached
  // formatter nor the date depends on the host's zone, which can change while
  // a page is open.
  return [
    dateTimeFormatFor(locale, {...options, calendar, timeZone: 'UTC'}),
    utcTime(pd.year, pd.month - 1, pd.day),
  ];
}

/** Options that print a time of day or a zone, which a PlainDate lacks. */
const TIME_OF_DAY_FIELDS = [
  'timeZoneName',
  'hour',
  'minute',
  'second',
  'fractionalSecondDigits',
  'dayPeriod',
  'timeStyle',
] as const satisfies ReadonlyArray<keyof Intl.DateTimeFormatOptions>;

/**
 * One `Intl.DateTimeFormat` per locale and options, built on first use.
 * Building a formatter costs far more than formatting with it, and a calendar
 * formats each of a month's 42 day labels with the same options on every
 * render. The options are keyed in a fixed order, so the same options written
 * in another order share a formatter.
 */
const dateTimeFormats = new Map<string, Intl.DateTimeFormat>();

/** @internal plainDateFormat's formatter cache; not part of the public API. */
export function dateTimeFormatFor(
  locale: Locale,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = JSON.stringify([
    locale,
    Object.entries(options).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  ]);
  let format = dateTimeFormats.get(key);
  if (format == null) {
    format = new Intl.DateTimeFormat(locale, options);
    dateTimeFormats.set(key, format);
  }
  return format;
}

/**
 * @internal `dateTimeFormatFor`, except that without `options.timeZone` it
 * builds a formatter for the call. A cached formatter keeps the host zone it
 * was built in.
 */
export function dateTimeFormatAtCall(
  locale: Locale,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  return options.timeZone === undefined
    ? new Intl.DateTimeFormat(locale, options)
    : dateTimeFormatFor(locale, options);
}

/**
 * The locale's name for the "week of year" date field ("week", "Woche", "週"),
 * from CLDR through `Intl.DisplayNames`. Calendar names its week-number
 * column header with it, so no catalog string is needed for a word the
 * platform already carries in every locale.
 *
 * `Intl.DisplayNames` with `type: 'dateTimeField'` is inside the Baseline − 2
 * support tier (Chrome 106, Safari 15.4, Firefox 110). Should a host lack it
 * or return nothing, the field's English CLDR name stands in rather than an
 * empty header.
 */
export function plainDateWeekFieldName(locale: Locale = 'en'): string {
  try {
    const name = new Intl.DisplayNames(locale, {type: 'dateTimeField'}).of(
      'weekOfYear',
    );
    if (name != null && name !== '') {
      return name;
    }
  } catch {
    // Fall through to the English CLDR value.
  }
  return 'week';
}

const dayNumberFormats = new Map<string, Intl.NumberFormat>();

/**
 * A day of the month or a week number in the locale's own digits: `15` in
 * English, `۱۵` in Persian, `١٥` in Egyptian Arabic. A `numberingSystem`
 * replaces the locale's digits. Only the digits change. The number stays the
 * value that it is given, so no calendar applies, and no grouping separator or
 * unit word is added.
 * Internal: not re-exported from `utils/index.ts`.
 */
export function plainDateFormatDayNumber(
  value: number,
  locale: Locale,
  numberingSystem?: string,
): string {
  const key = `${locale}|${numberingSystem ?? ''}`;
  let format = dayNumberFormats.get(key);
  if (format == null) {
    format = new Intl.NumberFormat(locale, {
      useGrouping: false,
      numberingSystem,
    });
    dayNumberFormats.set(key, format);
  }
  return format.format(value);
}

// =============================================================================
// Shared date-only format vocabulary
// =============================================================================

/**
 * The date-only members of Timestamp's `format` vocabulary that a
 * calendar-date field (no time-of-day) can render. Both Timestamp and
 * DateInput share these string literals and the mapping below so that the same
 * literal renders the same date shape in either component.
 *
 * - `date`: locale short-month date, e.g. "Mar 21, 2026"
 * - `date_long`: locale long-month date, e.g. "March 21, 2026"
 * - `date_weekday`: short weekday + short-month date, e.g. "Wed, Mar 21, 2026"
 * - `system_date`: ISO 8601 calendar date, e.g. "2026-03-21"
 */
export type SharedDateFormat =
  'date' | 'date_long' | 'date_weekday' | 'system_date';

/**
 * Intl option bags for the locale-aware shared date members. `system_date` is
 * intentionally absent — it is emitted as a fixed ISO `YYYY-MM-DD` string, not
 * via `Intl` — and is handled directly by {@link formatSharedDate}.
 *
 * This is the single source of truth consumed by both Timestamp's
 * `formatTimestamp` switch and DateInput's display path, so the two never
 * drift for the members they share.
 */
export const SHARED_DATE_FORMAT_OPTIONS: Record<
  Exclude<SharedDateFormat, 'system_date'>,
  Intl.DateTimeFormatOptions
> = {
  date: DATE_FORMAT_SHORT_WITH_YEAR,
  date_long: DATE_FORMAT_LONG,
  date_weekday: DATE_FORMAT_SHORT_WITH_WEEKDAY,
};

/**
 * Renders a {@link PlainDate} using one of the {@link SharedDateFormat}
 * members. The shared entry point DateInput uses for the named-format path;
 * Timestamp maps the same members onto {@link SHARED_DATE_FORMAT_OPTIONS} in
 * its own `formatTimestamp` switch (its input is a `Date`, not a `PlainDate`).
 * The locale-aware members write the date in `calendar`, which defaults to
 * Gregorian. `system_date` stays the Gregorian ISO date in every calendar.
 */
export function formatSharedDate(
  pd: PlainDate,
  format: SharedDateFormat,
  locale: Locale = 'en',
  calendar: CalendarSystem = 'gregory',
): string {
  if (format === 'system_date') {
    return plainDateToISO(pd);
  }
  return plainDateFormat(
    pd,
    {...SHARED_DATE_FORMAT_OPTIONS[format], calendar},
    locale,
  );
}
