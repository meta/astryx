// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file calendarSystem.ts
 * @input A calendar identifier and Gregorian PlainDates
 * @output Calendar months located by their Gregorian days, their year and
 *   month numbers, month and year steps, dates from calendar fields,
 *   availability of each calendar, and calendar labels and digits
 * @position Shared date utility; read by the i18n calendar resolution, by
 *   the date components, and by Calendar's public hooks. Values stay Gregorian PlainDates. Temporal owns the arithmetic of
 *   every calendar whose months are not Gregorian.
 */

import type {Locale} from '../i18n/types';
import type {PlainDate} from './dateTypes';
import {
  DATE_FORMAT_MONTH_ONLY,
  dateTimeFormatAtCall,
  dateTimeFormatFor,
  plainDateAddDays,
  plainDateAddMonths,
  plainDateFormatDayNumber,
  plainDateFormatStandaloneMonthYear,
  plainDateFormatToParts,
  plainDateFromDate,
  plainDateFromInstant,
  plainDateIsInRange,
  getDaysInMonth,
} from './plainDate';

/**
 * A calendar system that date components can show: the calendars that
 * ECMA-402 and Temporal require. Values stay Gregorian ISO dates in every
 * calendar.
 */
export type CalendarSystem =
  | 'gregory'
  | 'iso8601'
  | 'buddhist'
  | 'roc'
  | 'japanese'
  | 'persian'
  | 'indian'
  | 'hebrew'
  | 'chinese'
  | 'dangi'
  | 'coptic'
  | 'ethiopic'
  | 'ethioaa'
  | 'islamic-civil'
  | 'islamic-tbla'
  | 'islamic-umalqura';

// A record, so the compiler checks that it lists every calendar exactly once.
const KNOWN_CALENDARS: Readonly<Record<CalendarSystem, true>> = {
  gregory: true,
  iso8601: true,
  buddhist: true,
  roc: true,
  japanese: true,
  persian: true,
  indian: true,
  hebrew: true,
  chinese: true,
  dangi: true,
  coptic: true,
  ethiopic: true,
  ethioaa: true,
  'islamic-civil': true,
  'islamic-tbla': true,
  'islamic-umalqura': true,
};

export const CALENDAR_SYSTEMS = Object.keys(
  KNOWN_CALENDARS,
) as ReadonlyArray<CalendarSystem>;

const GREGORIAN_ALIGNED: ReadonlySet<CalendarSystem> = new Set([
  'gregory',
  'iso8601',
  'buddhist',
  'roc',
  'japanese',
]);

/**
 * Whether `<input type="date">` can show the calendar. The native control is
 * Gregorian by specification, so only `gregory` and `iso8601` qualify.
 */
export function isGregorianCalendar(calendar: CalendarSystem): boolean {
  return calendar === 'gregory' || calendar === 'iso8601';
}

/** Whether the calendar's months and days are the Gregorian ones. */
export function isGregorianAligned(calendar: CalendarSystem): boolean {
  return GREGORIAN_ALIGNED.has(calendar);
}

export function isCalendarSystem(value: string): value is CalendarSystem {
  return Object.hasOwn(KNOWN_CALENDARS, value);
}

// The published types must not need the `esnext.temporal` library.
// This module declares only the Temporal members it reads.
interface TemporalPlainDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly daysInMonth: number;
  readonly monthsInYear: number;
  with(fields: {year?: number; month?: number; day: number}): TemporalPlainDate;
  add(duration: {months?: number; years?: number}): TemporalPlainDate;
  until(
    other: TemporalPlainDate,
    options: {largestUnit: 'months'},
  ): {readonly months: number};
  withCalendar(calendar: 'iso8601'): TemporalPlainDate;
}

interface TemporalPlainDateConstructor {
  new (
    isoYear: number,
    isoMonth: number,
    isoDay: number,
    calendar: string,
  ): TemporalPlainDate;
  from(
    fields: CalendarDateFields & {calendar: string},
    options: {overflow: 'reject'},
  ): TemporalPlainDate;
}

interface TemporalNamespace {
  PlainDate: TemporalPlainDateConstructor;
}

function getTemporal(): TemporalNamespace | undefined {
  const temporal = (globalThis as {Temporal?: Partial<TemporalNamespace>})
    .Temporal;
  return typeof temporal?.PlainDate === 'function'
    ? (temporal as TemporalNamespace)
    : undefined;
}

// The key is the Temporal object, so a polyfill that loads later gets its
// own probe.
const supportedCalendars = new WeakMap<object, Map<CalendarSystem, boolean>>();

/**
 * Whether this runtime can show the calendar. Gregorian-aligned calendars
 * always can. The others need a `Temporal` that knows the calendar: a
 * polyfill build without non-ISO calendars throws for them.
 */
export function isCalendarSystemAvailable(calendar: CalendarSystem): boolean {
  if (isGregorianAligned(calendar)) {
    return true;
  }
  const temporal = getTemporal();
  if (temporal == null) {
    return false;
  }
  let known = supportedCalendars.get(temporal);
  if (known == null) {
    known = new Map();
    supportedCalendars.set(temporal, known);
  }
  let isSupported = known.get(calendar);
  if (isSupported == null) {
    try {
      new temporal.PlainDate(2000, 1, 1, calendar);
      isSupported = true;
    } catch {
      isSupported = false;
    }
    known.set(calendar, isSupported);
  }
  return isSupported;
}

function inCalendar(
  calendar: CalendarSystem,
  pd: PlainDate,
): TemporalPlainDate {
  const temporal = getTemporal();
  if (temporal == null) {
    throw new Error(`The "${calendar}" calendar needs Temporal.`);
  }
  return new temporal.PlainDate(pd.year, pd.month, pd.day, calendar);
}

function toGregorian(date: TemporalPlainDate): PlainDate {
  const iso = date.withCalendar('iso8601');
  return {year: iso.year, month: iso.month, day: iso.day};
}

/** A month of a calendar, located by its first and last Gregorian days. */
export interface CalendarMonth {
  readonly start: PlainDate;
  readonly end: PlainDate;
  readonly length: number;
}

function makeMonth(start: PlainDate, length: number): CalendarMonth {
  return {start, end: plainDateAddDays(start, length - 1), length};
}

function gregorianMonth(year: number, month: number): CalendarMonth {
  return makeMonth({year, month, day: 1}, getDaysInMonth(year, month));
}

function temporalMonth(firstDay: TemporalPlainDate): CalendarMonth {
  return makeMonth(toGregorian(firstDay), firstDay.daysInMonth);
}

/** The day of the calendar month that a Gregorian date falls on. */
export function calendarDayOfMonth(
  calendar: CalendarSystem,
  pd: PlainDate,
): number {
  return isGregorianAligned(calendar) ? pd.day : inCalendar(calendar, pd).day;
}

/** The calendar month that contains a Gregorian date. */
export function calendarMonthOf(
  calendar: CalendarSystem,
  pd: PlainDate,
): CalendarMonth {
  if (isGregorianAligned(calendar)) {
    return gregorianMonth(pd.year, pd.month);
  }
  return temporalMonth(inCalendar(calendar, pd).with({day: 1}));
}

/**
 * A calendar month by its year and its position in that year, as
 * `Temporal.PlainDate` numbers them: month 13 exists in a Hebrew leap year.
 */
export interface CalendarYearMonth {
  readonly year: number;
  readonly month: number;
}

// Temporal counts the years of these Gregorian-aligned calendars from another
// epoch: 2026 is 2569 in `buddhist` and 115 in `roc`.
const GREGORIAN_YEAR_OFFSETS: Partial<Record<CalendarSystem, number>> = {
  buddhist: 543,
  roc: -1911,
};

/** The year and month numbers of a calendar month. */
export function calendarYearMonthOf(
  calendar: CalendarSystem,
  month: CalendarMonth,
): CalendarYearMonth {
  if (isGregorianAligned(calendar)) {
    return {
      year: month.start.year + (GREGORIAN_YEAR_OFFSETS[calendar] ?? 0),
      month: month.start.month,
    };
  }
  const {year, month: monthOfYear} = inCalendar(calendar, month.start);
  return {year, month: monthOfYear};
}

/**
 * The calendar month with these year and month numbers. A month past the end
 * of its year becomes the last month of that year, as Temporal constrains it.
 */
export function calendarMonthFromYearMonth(
  calendar: CalendarSystem,
  {year, month}: CalendarYearMonth,
): CalendarMonth {
  if (isGregorianAligned(calendar)) {
    // A Gregorian year has 12 months. Past it, `getDaysInMonth` answers
    // undefined, so constrain here as the Temporal branch below already does.
    const monthOfYear = Math.min(
      month,
      calendarMonthsInCalendarYear(calendar, year),
    );
    return gregorianMonth(
      year - (GREGORIAN_YEAR_OFFSETS[calendar] ?? 0),
      monthOfYear,
    );
  }
  // `with` replaces the year and month of any date in the calendar.
  return temporalMonth(
    inCalendar(calendar, {year: 2000, month: 1, day: 1}).with({
      year,
      month,
      day: 1,
    }),
  );
}

/** The calendar month `n` months after `month`, or before it when negative. */
export function calendarAddMonths(
  calendar: CalendarSystem,
  month: CalendarMonth,
  n: number,
): CalendarMonth {
  if (n === 0) {
    return month;
  }
  if (isGregorianAligned(calendar)) {
    const {year, month: monthOfYear} = plainDateAddMonths(month.start, n);
    return gregorianMonth(year, monthOfYear);
  }
  return temporalMonth(inCalendar(calendar, month.start).add({months: n}));
}

/**
 * Moves a date by `n` calendar months. It keeps the day of the month and
 * clamps it to the length of the target month.
 */
export function calendarShiftMonths(
  calendar: CalendarSystem,
  pd: PlainDate,
  n: number,
): PlainDate {
  if (isGregorianAligned(calendar)) {
    return plainDateAddMonths(pd, n);
  }
  return toGregorian(inCalendar(calendar, pd).add({months: n}));
}

/**
 * Moves a date by `n` calendar years, to the same month of the target year.
 * It clamps the day of the month. A leap month that the target year does not
 * have becomes its common counterpart, because Temporal keeps the month code
 * and constrains it.
 */
export function calendarShiftYears(
  calendar: CalendarSystem,
  pd: PlainDate,
  n: number,
): PlainDate {
  if (isGregorianAligned(calendar)) {
    return plainDateAddMonths(pd, n * 12);
  }
  return toGregorian(inCalendar(calendar, pd).add({years: n}));
}

/** Whether a Gregorian date falls inside a calendar month. */
export function isInCalendarMonth(
  pd: PlainDate,
  month: CalendarMonth,
): boolean {
  return plainDateIsInRange(pd, [month.start, month.end]);
}

/**
 * The day that names a calendar month: its middle day. In the Japanese
 * calendar an era can start inside a month, and most days of that month then
 * belong to the era of its middle day.
 */
export function calendarMonthLabelDay(month: CalendarMonth): PlainDate {
  return plainDateAddDays(month.start, Math.floor(month.length / 2));
}

/**
 * The stand-alone month and year label of a calendar month, such as
 * "Aban 1405 AP", named by `calendarMonthLabelDay`. When `day` is given and the
 * month spans an era change, it formats that day instead, clamped to the
 * month, so January 1989 reads 昭和64年1月 on the 3rd and 平成元年1月 on the
 * 22nd.
 */
export function formatCalendarMonthLabel(
  calendar: CalendarSystem,
  month: CalendarMonth,
  locale: Locale,
  day?: number,
): string {
  const labelDay =
    day != null && calendarMonthSpansEras(calendar, month, locale)
      ? plainDateAddDays(
          month.start,
          Math.min(Math.max(day, 1), month.length) - 1,
        )
      : calendarMonthLabelDay(month);
  return plainDateFormatStandaloneMonthYear(
    labelDay,
    locale,
    labelCalendar(calendar),
  );
}

/** Whether the first and last days of a calendar month fall in different eras. */
function calendarMonthSpansEras(
  calendar: CalendarSystem,
  month: CalendarMonth,
  locale: Locale,
): boolean {
  return (
    !isGregorianCalendar(calendar) &&
    eraYearAt(calendar, month.start, locale).era !==
      eraYearAt(calendar, month.end, locale).era
  );
}

// Intl has no month names for `iso8601`. Labels use `gregory`, which has the
// same months and days.
function labelCalendar(calendar: CalendarSystem): CalendarSystem {
  return calendar === 'iso8601' ? 'gregory' : calendar;
}

function formatToParts(
  calendar: CalendarSystem,
  pd: PlainDate,
  options: Intl.DateTimeFormatOptions,
  locale: Locale,
): Intl.DateTimeFormatPart[] {
  return plainDateFormatToParts(pd, {...options, calendar}, locale);
}

const MONTH_PART_TYPES: ReadonlySet<string> = new Set([
  'era',
  'year',
  'relatedYear',
  'yearName',
  'month',
]);

function monthPartsKey(parts: Intl.DateTimeFormatPart[]): string {
  return parts
    .filter(part => MONTH_PART_TYPES.has(part.type))
    .map(part => part.value)
    .join('|');
}

/**
 * Formats a Gregorian date in the calendar, such as "Friday, Aban 8, 1405 AP".
 * The label always names the month and day that the grid shows. Intl and the
 * runtime's Temporal can disagree on where a month of the Chinese or Dangi
 * calendar starts; the label then takes its month and year from the middle of
 * the Temporal month, and its day from Temporal. With `relatedYear`, a
 * Chinese or Dangi year that the locale names only by its place in the 60-year
 * cycle becomes the related Gregorian year.
 */
export function formatCalendarDate(
  calendar: CalendarSystem,
  pd: PlainDate,
  options: Intl.DateTimeFormatOptions,
  locale: Locale,
  labelOptions?: {readonly relatedYear?: boolean},
): string {
  return joinParts(
    formatCalendarDateToParts(calendar, pd, options, locale, labelOptions),
  );
}

/** The parts of `formatCalendarDate`'s label. */
export function formatCalendarDateToParts(
  calendar: CalendarSystem,
  pd: PlainDate,
  options: Intl.DateTimeFormatOptions,
  locale: Locale,
  {relatedYear = false}: {readonly relatedYear?: boolean} = {},
): Intl.DateTimeFormatPart[] {
  const parts = formatToParts(labelCalendar(calendar), pd, options, locale);
  const fixed = withTemporalDay(calendar, pd, parts, options, locale);
  return relatedYear
    ? withRelatedYear(calendar, pd, fixed, options, locale)
    : fixed;
}

function withRelatedYear(
  calendar: CalendarSystem,
  pd: PlainDate,
  parts: Intl.DateTimeFormatPart[],
  options: Intl.DateTimeFormatOptions,
  locale: Locale,
): Intl.DateTimeFormatPart[] {
  if (
    (calendar !== 'chinese' && calendar !== 'dangi') ||
    !isCalendarSystemAvailable(calendar) ||
    parts.some(part => (part.type as string) === 'relatedYear')
  ) {
    return parts;
  }
  const {numberingSystem} = dateTimeFormatFor(locale, {
    ...options,
    calendar,
    timeZone: 'UTC',
  }).resolvedOptions();
  const {year} = inCalendar(calendar, pd);
  const value = plainDateFormatDayNumber(year, locale, numberingSystem);
  return parts.map(part =>
    /^year(Name)?$/.test(part.type) ? {...part, value} : part,
  );
}

// Returns `parts` itself where Intl already names Temporal's month and day.
function withTemporalDay(
  calendar: CalendarSystem,
  pd: PlainDate,
  parts: Intl.DateTimeFormatPart[],
  options: Intl.DateTimeFormatOptions,
  locale: Locale,
): Intl.DateTimeFormatPart[] {
  if (isGregorianAligned(calendar) || !isCalendarSystemAvailable(calendar)) {
    return parts;
  }
  const date = inCalendar(calendar, pd);
  const middle = plainDateAddDays(
    pd,
    Math.floor(date.daysInMonth / 2) - (date.day - 1),
  );
  const middleParts = formatToParts(calendar, middle, options, locale);
  const intlDay = formatToParts(
    calendar,
    pd,
    {day: 'numeric'},
    'en-u-nu-latn',
  ).find(part => part.type === 'day')?.value;
  if (
    Number(intlDay) === date.day &&
    monthPartsKey(parts) === monthPartsKey(middleParts)
  ) {
    return parts;
  }
  const {numberingSystem} = dateTimeFormatFor(locale, {
    ...options,
    calendar,
    timeZone: 'UTC',
  }).resolvedOptions();
  const middleValues = new Map(
    middleParts.map(part => [part.type, part.value]),
  );
  return parts.map(part =>
    part.type === 'day'
      ? {
          ...part,
          value: plainDateFormatDayNumber(date.day, locale, numberingSystem),
        }
      : MONTH_PART_TYPES.has(part.type)
        ? {...part, value: middleValues.get(part.type) ?? part.value}
        : part,
  );
}

/**
 * Formats an instant as `formatCalendarDate` formats the day it falls on in
 * `timeZone`, the host's zone when omitted. Intl writes any time of day that
 * `options` asks for.
 */
export function formatCalendarInstant(
  calendar: CalendarSystem,
  instant: Date,
  options: Intl.DateTimeFormatOptions,
  locale: Locale,
  timeZone?: string,
): string {
  return instantLabel(calendar, instant, options, locale, timeZone).text;
}

/**
 * Formats the range between two instants. Intl writes the fields that both
 * ends share once. Where Intl names another month or day than Temporal at
 * either end, the range writes each end in full.
 */
export function formatCalendarInstantRange(
  calendar: CalendarSystem,
  start: Date,
  end: Date,
  options: Intl.DateTimeFormatOptions,
  locale: Locale,
  timeZone?: string,
): string {
  const ends = [start, end].map(instant =>
    instantLabel(calendar, instant, options, locale, timeZone),
  );
  const {format} = ends[0];
  if (ends.every(({isIntl}) => isIntl)) {
    return format.formatRange(start, end);
  }
  // Intl writes a range of different years as two full dates around its
  // separator, which gives the separator to put between the two full ends.
  const far = new Date(start.getTime() + 400 * 86_400_000);
  const both = format.formatRange(start, far);
  const [from, to] = [format.format(start), format.format(far)];
  const separator =
    both.startsWith(from) && both.endsWith(to)
      ? both.slice(from.length, both.length - to.length)
      : ' – ';
  const [first, last] = ends.map(({text}) => text);
  return first === last ? first : `${first}${separator}${last}`;
}

function instantLabel(
  calendar: CalendarSystem,
  instant: Date,
  options: Intl.DateTimeFormatOptions,
  locale: Locale,
  timeZone: string | undefined,
) {
  const format = dateTimeFormatAtCall(locale, {
    ...options,
    ...(timeZone === undefined ? {} : {timeZone}),
    calendar: labelCalendar(calendar),
  });
  const parts = format.formatToParts(instant);
  const day =
    timeZone === undefined
      ? plainDateFromDate(instant)
      : plainDateFromInstant(instant.getTime(), timeZone);
  const fixed = withTemporalDay(calendar, day, parts, options, locale);
  const isIntl = fixed === parts;
  return {
    format,
    isIntl,
    text: isIntl ? format.format(instant) : joinParts(fixed),
  };
}

function joinParts(parts: Intl.DateTimeFormatPart[]): string {
  return parts.map(part => part.value).join('');
}

/**
 * The fields of a date written in a calendar. A field gives either `year` or
 * `era` with `eraYear`, and either `monthCode` (such as `M05L` for a leap
 * month) or `month`, the month's position in its year.
 */
export interface CalendarDateFields {
  readonly year?: number;
  readonly era?: string;
  readonly eraYear?: number;
  readonly monthCode?: string;
  readonly month?: number;
  readonly day: number;
}

/**
 * The Gregorian date for fields written in a calendar that needs Temporal,
 * or null when the calendar does not have that date. Temporal validates the
 * fields and never adjusts them: 30 Esfand in a common Persian year is null.
 */
export function calendarDateFromFields(
  calendar: CalendarSystem,
  fields: CalendarDateFields,
): PlainDate | null {
  const temporal = getTemporal();
  if (temporal == null) {
    throw new Error(`The "${calendar}" calendar needs Temporal.`);
  }
  try {
    return toGregorian(
      temporal.PlainDate.from({...fields, calendar}, {overflow: 'reject'}),
    );
  } catch (error) {
    if (error instanceof RangeError || error instanceof TypeError) {
      return null;
    }
    throw error;
  }
}

/** The number of months in the calendar year that contains a date. */
export function calendarMonthsInYear(
  calendar: CalendarSystem,
  pd: PlainDate,
): number {
  return isGregorianAligned(calendar)
    ? 12
    : inCalendar(calendar, pd).monthsInYear;
}

/**
 * The number of calendar months from the month `from` to the month `to`:
 * positive when `to` is later.
 */
export function calendarMonthsBetween(
  calendar: CalendarSystem,
  from: CalendarMonth,
  to: CalendarMonth,
): number {
  if (isGregorianAligned(calendar)) {
    return (
      (to.start.year - from.start.year) * 12 +
      (to.start.month - from.start.month)
    );
  }
  return inCalendar(calendar, from.start).until(
    inCalendar(calendar, to.start),
    {largestUnit: 'months'},
  ).months;
}

/**
 * The calendar month at a position in a year of the calendar. A
 * Gregorian-aligned calendar counts Gregorian years here; the others count
 * years as {@link calendarYearMonthOf} does.
 */
export function calendarMonthOfYear(
  calendar: CalendarSystem,
  year: number,
  month: number,
): CalendarMonth {
  return isGregorianAligned(calendar)
    ? gregorianMonth(year, month)
    : calendarMonthFromYearMonth(calendar, {year, month});
}

/** The number of months in a year of the calendar. */
export function calendarMonthsInCalendarYear(
  calendar: CalendarSystem,
  year: number,
): number {
  return isGregorianAligned(calendar)
    ? 12
    : calendarMonthsInYear(
        calendar,
        calendarMonthOfYear(calendar, year, 1).start,
      );
}

/**
 * The name of a calendar month, such as "Adar I". It formats the middle day of
 * the month, for the reason {@link formatCalendarMonthLabel} gives.
 */
export function formatCalendarMonthName(
  calendar: CalendarSystem,
  month: CalendarMonth,
  locale: Locale,
): string {
  return formatCalendarDate(
    calendar,
    plainDateAddDays(month.start, Math.floor(month.length / 2)),
    DATE_FORMAT_MONTH_ONLY,
    locale,
  );
}

const YEAR_PART_TYPES: ReadonlySet<string> = new Set([
  'era',
  'year',
  'relatedYear',
]);

/** The era and year parts of a date, as the locale writes them in a long date. */
function eraYearAt(
  calendar: CalendarSystem,
  pd: PlainDate,
  locale: Locale,
): {readonly era: string | undefined; readonly label: string | null} {
  const parts = formatToParts(
    calendar,
    pd,
    {era: 'short', year: 'numeric', month: 'long', day: 'numeric'},
    locale,
  );
  const era = parts.find(part => part.type === 'era')?.value;
  const first = parts.findIndex(part => YEAR_PART_TYPES.has(part.type));
  if (first === -1) {
    return {era, label: null};
  }
  let last = first;
  parts.forEach((part, index) => {
    if (YEAR_PART_TYPES.has(part.type)) {
      last = index;
    }
  });
  const label = parts
    .slice(first, last + 1)
    .filter(part => YEAR_PART_TYPES.has(part.type) || part.type === 'literal')
    .map(part => part.value)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return {era, label};
}

/**
 * Whether the first and last days of a year of the calendar fall in different
 * eras, as the Japanese year 2019 does (Heisei, then Reiwa). Only an era change
 * counts: other parts, such as a Chinese related year, can disagree at the
 * edges of a year when Intl and Temporal place a month start one day apart.
 */
export function calendarYearSpansEras(
  calendar: CalendarSystem,
  year: number,
  locale: Locale,
): boolean {
  if (isGregorianCalendar(calendar)) {
    return false;
  }
  const months = calendarMonthsInCalendarYear(calendar, year);
  const start = eraYearAt(
    calendar,
    calendarMonthOfYear(calendar, year, 1).start,
    locale,
  );
  const end = eraYearAt(
    calendar,
    calendarMonthOfYear(calendar, year, months).end,
    locale,
  );
  return start.era !== end.era && start.label != null && end.label != null;
}

/**
 * The label of a year of the calendar, with its era where the locale writes
 * one in a date, such as "令和8" in `ja-JP` or "1405 AP" in English. It uses the
 * era and year parts of a long date, in the locale's order and digits, with the
 * text between them. A year that spans an era change takes its era from `at`,
 * a month position and a day clamped to that month, so 2019 reads "平成31" in
 * January and "令和元" in May. Without `at`, and for every other year, the label
 * comes from the middle of the year. Gregorian years are plain numbers.
 */
export function formatCalendarYearLabel(
  calendar: CalendarSystem,
  year: number,
  locale: Locale,
  at?: {readonly month: number; readonly day: number},
): string {
  if (isGregorianCalendar(calendar)) {
    return String(year);
  }
  const months = calendarMonthsInCalendarYear(calendar, year);
  if (at != null && calendarYearSpansEras(calendar, year, locale)) {
    const month = calendarMonthOfYear(
      calendar,
      year,
      Math.min(Math.max(at.month, 1), months),
    );
    const day = Math.min(Math.max(at.day, 1), month.length);
    return (
      eraYearAt(calendar, plainDateAddDays(month.start, day - 1), locale)
        .label ?? String(year)
    );
  }
  const middle = eraYearAt(
    calendar,
    calendarMonthOfYear(calendar, year, Math.floor(months / 2) + 1).start,
    locale,
  );
  return middle.label ?? String(year);
}
