// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file calendarDateParser.ts
 * @input Date text, locale, calendar; Intl, calendarSystem, unicodeDigits
 * @output Cached per-locale lexicons, a typed-date parser with distinct rejection
 *   kinds, committed display text, the format hint, and calendar display names
 * @position Core utility; used by DateInput and DateTimeInput through useTypedDate
 *
 * SYNC: When modified, update:
 * - /packages/core/src/utils/calendarDateParser.test.ts
 * - /packages/core/src/utils/calendarDateParser.roundtrip.test.ts
 */

import type {PlainDate} from './dateTypes';
import type {Locale} from '../i18n/types';
import {
  type CalendarSystem,
  type CalendarDateFields,
  calendarDateFromFields,
  calendarMonthOf,
  calendarMonthsInYear,
  formatCalendarDate,
  isCalendarSystemAvailable,
  isGregorianAligned,
} from './calendarSystem';
import {
  type SharedDateFormat,
  SHARED_DATE_FORMAT_OPTIONS,
  formatSharedDate,
  getDaysInMonth,
  plainDateAddDays,
  plainDateDiffDays,
  plainDateFormat,
  plainDateFormatToParts,
  plainDateToday,
} from './plainDate';
import {INVISIBLE_CHARS, toAsciiDigits} from './unicodeDigits';

/** How a typed text reads in a calendar. */
export type CalendarDateParseResult =
  | {readonly kind: 'empty'}
  /** Part of a date: nothing to report yet. */
  | {readonly kind: 'incomplete'}
  /** Text that cannot become a date. */
  | {readonly kind: 'unreadable'}
  /** A readable date that the calendar does not have. */
  | {readonly kind: 'nonexistent'; readonly isComplete: boolean}
  /** A date that the constraints reject. */
  | {
      readonly kind: 'outOfRange';
      readonly date: PlainDate;
      readonly isComplete: boolean;
    }
  /**
   * A date. `isComplete` is true when more typing cannot change its meaning,
   * so a field may report it while the person types.
   */
  | {
      readonly kind: 'value';
      readonly date: PlainDate;
      readonly isComplete: boolean;
    };

export interface CalendarDateParseOptions {
  /** The Gregorian date that two-digit and omitted years resolve against. */
  readonly today?: PlainDate;
  /** Reads ISO-shaped text as a Gregorian ISO date, as `system_date` shows. */
  readonly isoIsGregorian?: boolean;
  /** Returns true for a date that may not be chosen. */
  readonly isDateDisabled?: (date: PlainDate) => boolean;
}

type DateField = 'year' | 'month' | 'day';

interface EraArithmetic {
  /** The Gregorian year before era year 1, or after it for a backward era. */
  readonly base: number;
  readonly isForward: boolean;
}

/** What a locale writes for one calendar, learned from Intl. */
export interface CalendarDateLexicon {
  readonly locale: Locale;
  readonly calendar: CalendarSystem;
  readonly order: ReadonlyArray<DateField>;
  readonly nameOrder: ReadonlyArray<DateField>;
  readonly months: ReadonlyMap<string, ReadonlySet<string>>;
  readonly monthTemplates: ReadonlyArray<MonthTemplate>;
  readonly leapMarkers: ReadonlySet<string>;
  readonly eras: ReadonlyMap<string, string>;
  readonly yearAliases: ReadonlyMap<string, string>;
  readonly trailers: ReadonlySet<string>;
  readonly yearMarkers: ReadonlySet<string>;
  readonly separators: ReadonlySet<string>;
  readonly weekdays: ReadonlySet<string>;
  readonly vocabulary: ReadonlyArray<string>;
  readonly vocabularySet: ReadonlySet<string>;
  readonly isNumericMonthOrdinal: boolean;
  readonly eraArithmetic: ReadonlyMap<string, EraArithmetic>;
}

interface MonthTemplate {
  readonly pre: string;
  readonly post: string;
  readonly isLeap: boolean;
}

const NUMERIC: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
};
const LONG = SHARED_DATE_FORMAT_OPTIONS.date_long;
const YEAR_ONLY: Intl.DateTimeFormatOptions = {year: 'numeric'};
const ERA_AND_YEAR: Intl.DateTimeFormatOptions = {
  era: 'short',
  year: 'numeric',
};
const LONG_WITH_ERA: Intl.DateTimeFormatOptions = {...LONG, era: 'long'};
const ERA_WIDTHS: Readonly<Record<string, Intl.DateTimeFormatOptions>> = {
  long: {era: 'long', year: 'numeric'},
  short: ERA_AND_YEAR,
  narrow: {era: 'narrow', year: 'numeric'},
};
const WEEKDAY_FORMATS: ReadonlyArray<Intl.DateTimeFormatOptions> = [
  {weekday: 'long'},
  {weekday: 'short'},
  {...LONG, weekday: 'long'},
  {...LONG, weekday: 'short'},
];
const LONG_WITH_WEEKDAY: Intl.DateTimeFormatOptions = {
  ...LONG,
  weekday: 'short',
};
// Built at runtime: the Babel copy in a Next.js source build rejects a
// `\p{...}` regex literal.
const LETTER = new RegExp('[\\p{L}\\p{M}]', 'u');
const SEPARATOR = new RegExp('[\\p{P}\\p{S}]', 'u');
const ONLY_SEPARATORS = new RegExp('^[\\p{P}\\p{S}]+$', 'u');
const NOT_WORDS = new RegExp('[\\d\\p{P}\\p{S}]+', 'gu');
const LATIN_MARKS = new RegExp('(\\p{Script=Latin})\\p{Mn}+', 'gu');
// Scripts written without spaces between words: a name may run into the
// next word, so a name match there needs no word boundary.
const SPACELESS = new RegExp(
  '[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}\\p{Script=Thai}\\p{Script=Lao}\\p{Script=Khmer}\\p{Script=Myanmar}]',
  'u',
);
const LUNISOLAR: ReadonlySet<CalendarSystem> = new Set(['chinese', 'dangi']);
const WITHOUT_ERA: ReadonlySet<CalendarSystem> = new Set([
  'gregory',
  'iso8601',
  'chinese',
  'dangi',
]);

/**
 * One ISO date inside each era of a calendar. Intl supplies the names; the
 * era codes are the Temporal and ECMA-402 identifiers.
 */
const ERA_SAMPLES: Readonly<Record<string, Readonly<Record<string, string>>>> =
  {
    gregory: {ce: '2000-06-15', bce: '-000100-06-15'},
    japanese: {
      meiji: '1900-06-15',
      taisho: '1920-06-15',
      showa: '1950-06-15',
      heisei: '2000-06-15',
      reiwa: '2026-06-15',
    },
    roc: {roc: '2026-06-15', broc: '1900-06-15'},
    buddhist: {be: '2026-06-15'},
    ethiopic: {am: '2026-06-15', aa: '-005600-06-15'},
    ethioaa: {aa: '2026-06-15'},
    coptic: {am: '2026-06-15'},
    persian: {ap: '2026-06-15'},
    hebrew: {am: '2026-06-15'},
    indian: {shaka: '2026-06-15'},
    'islamic-umalqura': {ah: '2026-06-15'},
    'islamic-civil': {ah: '2026-06-15'},
    'islamic-tbla': {ah: '2026-06-15'},
  };

/** The calendar a text field reads and writes. `iso8601` writes as Gregorian. */
function textCalendar(calendar: CalendarSystem): CalendarSystem {
  if (calendar === 'iso8601' || !isCalendarSystemAvailable(calendar)) {
    return 'gregory';
  }
  return calendar;
}

// =============================================================================
// Intl access
// =============================================================================

/** Part types such as `relatedYear` and `yearName` are absent from older TS libs. */
function partType(part: Intl.DateTimeFormatPart): string {
  return part.type;
}

function isoToPlainDate(iso: string): PlainDate {
  const match = /^(-?\d+)-(\d+)-(\d+)$/.exec(iso);
  if (match == null) {
    throw new RangeError(`Bad sample date ${iso}`);
  }
  return {year: +match[1], month: +match[2], day: +match[3]};
}

function partsOf(
  locale: Locale,
  calendar: CalendarSystem,
  options: Intl.DateTimeFormatOptions,
  pd: PlainDate,
): Intl.DateTimeFormatPart[] {
  return plainDateFormatToParts(pd, {...options, calendar}, locale);
}

// =============================================================================
// Normalization
// =============================================================================

/** Text in one comparable form: ASCII digits, lower case, no Latin accents. */
export function normalizeDateText(text: string, locale: Locale): string {
  // Most typed text is printable ASCII; skip the Unicode passes it does not need.
  if (/^[\u0020-\u007e]*$/.test(text)) {
    const ascii = text.replaceAll('`', "'");
    return /[A-Z]/.test(ascii) ? ascii.toLocaleLowerCase(locale) : ascii;
  }
  const folded = text
    .normalize('NFKC')
    .replace(INVISIBLE_CHARS, '')
    // Pasted text can carry bidi embeddings.
    .replace(/[\u202a-\u202e]/g, '')
    // People type an ASCII apostrophe or quote for Hebrew geresh and
    // gershayim, and for the ʻ of Islamic month names such as Dhuʻl-Hijjah.
    .replace(/[\u05f3\u2018\u2019\u02bb\u02bc\u02bf`]/g, "'")
    .replace(/[\u05f4\u201c\u201d]/g, '"');
  let result = (toAsciiDigits(folded) ?? folded).toLocaleLowerCase(locale);
  if (/[\u00c0-\u024f\u1e00-\u1eff]/.test(result)) {
    // Fold Latin accents only: in other scripts a mark is part of the letter.
    result = result
      .normalize('NFD')
      .replace(LATIN_MARKS, '$1')
      .normalize('NFC');
  }
  return result;
}

// =============================================================================
// Lexicon
// =============================================================================

const lexicons = new Map<string, CalendarDateLexicon>();

/**
 * The lexicon for a locale and calendar, built on first use and cached.
 * Building one formats a few hundred dates; call it when a field gains focus.
 */
export function getCalendarDateLexicon(
  locale: Locale,
  calendar: CalendarSystem,
): CalendarDateLexicon {
  const resolved = textCalendar(calendar);
  const key = `${locale}|${resolved}`;
  let lexicon = lexicons.get(key);
  if (lexicon == null) {
    lexicon = buildLexicon(locale, resolved);
    lexicons.set(key, lexicon);
  }
  return lexicon;
}

interface SampledMonth {
  readonly code: string;
  readonly ordinal: number;
  readonly mid: PlainDate;
  readonly monthsInYear: number;
}

/** Months to learn names from: a few calendar years, so leap months appear. */
function sampleMonths(calendar: CalendarSystem): SampledMonth[] {
  if (isGregorianAligned(calendar)) {
    return Array.from({length: 12}, (_, i) => ({
      code: `M${String(i + 1).padStart(2, '0')}`,
      ordinal: i + 1,
      mid: {year: 2026, month: i + 1, day: 15},
      monthsInYear: 12,
    }));
  }
  const reference = calendarYearOf(calendar, {year: 2026, month: 6, day: 15});
  const sampled: SampledMonth[] = [];
  for (let year = reference - 1; year <= reference + 3; year++) {
    const starts: {code: string; start: PlainDate}[] = [];
    for (let n = 1; n <= 13; n++) {
      for (const leap of ['', 'L']) {
        const code = `M${String(n).padStart(2, '0')}${leap}`;
        const start = calendarDateFromFields(calendar, {
          year,
          monthCode: code,
          day: 1,
        });
        if (start != null) {
          starts.push({code, start});
        }
      }
    }
    starts.sort((a, b) => plainDateDiffDays(b.start, a.start));
    starts.forEach(({code, start}, i) => {
      const month = calendarMonthOf(calendar, start);
      sampled.push({
        code,
        ordinal: i + 1,
        mid: plainDateAddDays(month.start, Math.floor(month.length / 2)),
        monthsInYear: starts.length,
      });
    });
  }
  return sampled;
}

/** The calendar's year number of a Gregorian date, read from Intl. */
function calendarYearOf(calendar: CalendarSystem, pd: PlainDate): number {
  const parts = partsOf('en', calendar, YEAR_ONLY, pd);
  const year = parts.find(
    p => partType(p) === 'relatedYear' || p.type === 'year',
  );
  return Number(normalizeDateText(year?.value ?? '', 'en'));
}

function fieldOrder(parts: Intl.DateTimeFormatPart[]): DateField[] {
  const order: DateField[] = [];
  for (const part of parts) {
    const type = partType(part) === 'relatedYear' ? 'year' : part.type;
    if (
      (type === 'year' || type === 'month' || type === 'day') &&
      !order.includes(type)
    ) {
      order.push(type);
    }
  }
  return order;
}

function buildLexicon(
  locale: Locale,
  calendar: CalendarSystem,
): CalendarDateLexicon {
  const locales: Locale[] = locale === 'en' ? ['en'] : [locale, 'en'];
  const norm = (text: string) => normalizeDateText(text, locale).trim();
  const months = new Map<string, Set<string>>();
  const templates = new Map<string, MonthTemplate>();
  const leapMarkers = new Set<string>();
  const eras = new Map<string, string>();
  const yearAliases = new Map<string, string>();
  const skip = new Set<string>();
  const trailers = new Set<string>();
  const yearMarkers = new Set<string>();
  const separators = new Set<string>();
  const weekdays = new Set<string>();

  const addSkip = (text: string, words = skip) => {
    for (const word of norm(text).replace(NOT_WORDS, ' ').split(/\s+/)) {
      if (word) {
        words.add(word);
      }
    }
  };
  const addMonth = (text: string, {code, ordinal}: SampledMonth) => {
    const name = norm(text);
    // A month number with affixes: "11月", "9:e mån", "윤6", "6bis". A name
    // can also hold another number: Hungarian "Réb. 1" is the third month.
    const match = /^(\D*)(\d+)(\D*)$/.exec(name);
    const isOwnNumber = [ordinal, Number(code.slice(1, 3))].includes(
      Number(match?.[2]),
    );
    if (!name || (/\d/.test(name) && (!LETTER.test(name) || isOwnNumber))) {
      if (match != null && (match[1] || match[3])) {
        templates.set(`${match[1]}#${match[3]}`, {
          pre: match[1],
          post: match[3],
          isLeap: code.endsWith('L'),
        });
      }
      return;
    }
    let codes = months.get(name);
    if (codes == null) {
      codes = new Set();
      months.set(name, codes);
    }
    codes.add(code);
  };

  const sampled = sampleMonths(calendar);
  const monthWidths: Intl.DateTimeFormatOptions[] = [
    LONG,
    {year: 'numeric', month: 'short', day: 'numeric'},
    NUMERIC,
    {month: 'long'},
    {month: 'short'},
  ];
  const baseText = new Map<string, string>();
  for (const month of sampled) {
    for (const loc of locales) {
      monthWidths.forEach((options, width) => {
        const text = partsOf(loc, calendar, options, month.mid).find(
          p => p.type === 'month',
        )?.value;
        if (text == null) {
          return;
        }
        const baseKey = `${loc}|${width}|${month.code.slice(0, 3)}`;
        if (month.code.endsWith('L')) {
          // A leap month written as its common month plus a marker ("闰六月").
          const base = baseText.get(baseKey);
          if (base != null && text.includes(base) && !/\d/.test(base)) {
            const marker = norm(text.replace(base, ''));
            if (marker) {
              leapMarkers.add(marker);
              return;
            }
          }
        } else {
          baseText.set(baseKey, text);
        }
        addMonth(text, month);
      });
    }
  }

  const literalFormats: Intl.DateTimeFormatOptions[] = [];
  for (const options of [
    NUMERIC,
    LONG,
    SHARED_DATE_FORMAT_OPTIONS.date,
    SHARED_DATE_FORMAT_OPTIONS.date_weekday,
    LONG_WITH_WEEKDAY,
  ]) {
    literalFormats.push(options, displayOptions(locale, calendar, options));
  }
  const literalDates = sampled.slice(0, 14).map(m => m.mid);
  for (const loc of locales) {
    for (const options of literalFormats) {
      for (const pd of literalDates) {
        const parts = partsOf(loc, calendar, options, pd);
        for (const [k, part] of parts.entries()) {
          if (part.type === 'literal' || partType(part) === 'yearName') {
            addSkip(part.value);
          }
          if (part.type === 'literal' && parts[k - 1]?.type === 'year') {
            addSkip(part.value, yearMarkers);
          }
        }
        if (loc === locale) {
          const tail = parts.at(-1);
          if (tail?.type === 'literal') {
            const trailer = norm(tail.value).replace(/\s+/g, '');
            if (ONLY_SEPARATORS.test(trailer)) {
              trailers.add(trailer);
            }
          }
        }
      }
    }
    for (let day = 0; day < 7; day++) {
      const pd = {year: 2026, month: 11, day: 1 + day};
      for (const options of WEEKDAY_FORMATS) {
        const text = partsOf(loc, calendar, options, pd).find(
          p => p.type === 'weekday',
        )?.value;
        if (text != null) {
          addSkip(text);
          addSkip(text, weekdays);
          // Vietnamese writes a weekday as a word and a number: "Thứ 2".
          if (/\d/.test(norm(text))) {
            skip.add(norm(text));
          }
        }
      }
    }
  }
  const hint = displayOptions(locale, calendar, NUMERIC);
  for (const part of partsOf(locale, calendar, hint, literalDates[0])) {
    const separator = norm(part.value).replace(/\s+/g, '');
    if (part.type === 'literal' && separator) {
      separators.add(separator);
    }
  }
  if (LUNISOLAR.has(calendar)) {
    // Year names cycle every 60 years.
    for (let year = 1996; year < 2057; year++) {
      for (const loc of locales) {
        for (const part of partsOf(loc, calendar, LONG, {
          year,
          month: 6,
          day: 15,
        })) {
          if (partType(part) === 'yearName') {
            addSkip(part.value);
          }
        }
      }
    }
  }

  const eraArithmetic = new Map<string, EraArithmetic>();
  const eraWidths: ReadonlyArray<'long' | 'short' | 'narrow'> =
    calendar === 'japanese' ? ['long', 'short', 'narrow'] : ['long', 'short'];
  for (const [code, iso] of Object.entries(ERA_SAMPLES[calendar] ?? {})) {
    const sample = isoToPlainDate(iso);
    for (const loc of locales) {
      // A full date can spell the era differently, such as French "EB".
      for (const options of [
        ...eraWidths.map(width => ERA_WIDTHS[width]),
        ...literalFormats,
      ]) {
        const text = partsOf(loc, calendar, options, sample).find(
          p => p.type === 'era',
        )?.value;
        if (text != null && norm(text)) {
          eras.set(norm(text), code);
        }
      }
    }
    const eraYear = (pd: PlainDate) => calendarEraYear('en', calendar, pd).year;
    const year = eraYear(sample);
    const isForward = eraYear({...sample, year: sample.year + 1}) > year;
    const base = isForward ? sample.year - year : sample.year + year;
    eraArithmetic.set(code, {base, isForward});
    const firstYear = {
      year: isForward ? base + 1 : base - 1,
      month: 12,
      day: 31,
    };
    // Some locales write era year 1 as a word, such as Japanese 元.
    if (isGregorianAligned(calendar) && firstYear.year > 0) {
      const text = partsOf(locale, calendar, LONG_WITH_ERA, firstYear).find(
        p => p.type === 'year',
      )?.value;
      if (text != null && !/\d/.test(norm(text))) {
        yearAliases.set(norm(text), '1');
      }
    }
  }
  if (calendar === 'japanese') {
    eraArithmetic.set('ce', {base: 0, isForward: true});
  }
  for (const marker of leapMarkers) {
    skip.delete(marker);
  }
  for (const word of [
    ...months.keys(),
    ...eras.keys(),
    ...yearAliases.keys(),
  ]) {
    skip.delete(word);
  }

  // Whether a typed month number is the month's position in its year (Hebrew)
  // or its code number (Chinese). Probed with a locale that writes numbers.
  let isNumericMonthOrdinal = false;
  const shifted = sampled.find(m => m.ordinal !== Number(m.code.slice(1, 3)));
  if (shifted != null) {
    const text = partsOf('sv', calendar, NUMERIC, shifted.mid).find(
      p => p.type === 'month',
    )?.value;
    isNumericMonthOrdinal =
      Number(normalizeDateText(text ?? '', 'sv').replace(/\D+/g, '')) ===
      shifted.ordinal;
  }

  const vocabularySet = new Set([
    ...months.keys(),
    ...eras.keys(),
    ...skip,
    ...leapMarkers,
    ...yearAliases.keys(),
  ]);
  const sample = {year: 2026, month: 11, day: 2};
  return {
    locale,
    calendar,
    order: fieldOrder(partsOf(locale, calendar, NUMERIC, sample)),
    nameOrder: fieldOrder(partsOf(locale, calendar, LONG, sample)),
    months,
    monthTemplates: [...templates.values()].sort(
      (a, b) => b.pre.length + b.post.length - (a.pre.length + a.post.length),
    ),
    leapMarkers,
    eras,
    yearAliases,
    trailers,
    yearMarkers,
    separators,
    weekdays,
    vocabulary: [...vocabularySet].sort((a, b) => b.length - a.length),
    vocabularySet,
    isNumericMonthOrdinal,
    eraArithmetic,
  };
}

/** The era name and era year Intl writes for a date. */
function calendarEraYear(
  locale: Locale,
  calendar: CalendarSystem,
  pd: PlainDate,
): {era: string; year: number} {
  const parts = partsOf(locale, calendar, ERA_AND_YEAR, pd);
  return {
    era: parts.find(p => p.type === 'era')?.value ?? '',
    year: Number(
      normalizeDateText(
        parts.find(p => p.type === 'year' || partType(p) === 'relatedYear')
          ?.value ?? '',
        locale,
      ),
    ),
  };
}

// =============================================================================
// Tokens
// =============================================================================

type Token =
  | {readonly t: 'num'; readonly v: string; readonly isAlias?: boolean}
  | {
      readonly t: 'month';
      readonly codes: ReadonlySet<string>;
      readonly isWeekday?: boolean;
    }
  | {readonly t: 'monthNum'; readonly v: string; readonly isLeap: boolean}
  | {readonly t: 'era'; readonly code: string; readonly isWeekday?: boolean}
  | {readonly t: 'leap'}
  | {readonly t: 'word'; readonly isYearMarker?: boolean}
  | {readonly t: 'sep'; readonly v: string};

type Tokens = Token[] | 'incomplete' | 'unreadable';

function tokenize(
  s: string,
  lex: CalendarDateLexicon,
  isDigitNameRead = true,
): Tokens {
  const out: Token[] = [];
  let hasDigitName = false;
  let i = 0;
  const end = s.trimEnd().length;
  while (i < end) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const template = matchTemplate(s, i, lex);
    if (template != null) {
      out.push(template.token);
      i = template.end;
      continue;
    }
    const digitName = isDigitNameRead && /\d/.test(ch) && matchWord(s, i, lex);
    if (digitName) {
      out.push(wordToken(digitName, lex));
      hasDigitName = true;
      i += digitName.length;
      continue;
    }
    if (/\d/.test(ch)) {
      let j = i;
      while (j < s.length && /\d/.test(s[j])) {
        j++;
      }
      out.push({t: 'num', v: s.slice(i, j)});
      i = j;
      continue;
    }
    const word = matchWord(s, i, lex);
    if (word != null) {
      out.push(wordToken(word, lex));
      i += word.length;
      continue;
    }
    if (SEPARATOR.test(ch)) {
      let j = i;
      while (j < end && (SEPARATOR.test(s[j]) || /\s/.test(s[j]))) {
        j++;
      }
      out.push({t: 'sep', v: s.slice(i, j).replace(/\s+/g, '')});
      i = j;
      continue;
    }
    let j = i;
    while (j < end && LETTER.test(s[j])) {
      j++;
    }
    const run = s.slice(i, j);
    const joined = matchJoinedWord(s, i, lex);
    if (joined != null) {
      out.push(wordToken(joined, lex));
      i += joined.length;
      continue;
    }
    const monthCodes = monthByPrefix(run, lex);
    if (monthCodes != null) {
      out.push({t: 'month', codes: monthCodes});
      i = j;
      continue;
    }
    if (j >= end && run && lex.vocabulary.some(w => w.startsWith(run))) {
      return 'incomplete';
    }
    return 'unreadable';
  }
  // Latvian "1. adars" is a month, and also day 1 of "adars". It is the day
  // when no other number can be the day. A number before the year word, as in
  // "26. g.", is the year.
  const canBeDay = (token: Token, k: number) => {
    const next = out.slice(k + 1).find(t => t.t !== 'sep');
    const isYear = next?.t === 'word' && next.isYearMarker === true;
    return token.t === 'num' && Number(token.v) <= 31 && !isYear;
  };
  if (hasDigitName && !out.some(canBeDay)) {
    return tokenize(s, lex, false);
  }
  return out;
}

function matchTemplate(
  s: string,
  i: number,
  lex: CalendarDateLexicon,
): {token: Token; end: number} | null {
  for (const template of lex.monthTemplates) {
    if (!s.startsWith(template.pre, i)) {
      continue;
    }
    const digits = /^\d+/.exec(s.slice(i + template.pre.length));
    if (digits == null) {
      continue;
    }
    const after = i + template.pre.length + digits[0].length;
    if (template.post && !s.startsWith(template.post, after)) {
      continue;
    }
    if (!template.post && !template.pre) {
      continue;
    }
    return {
      token: {t: 'monthNum', v: digits[0], isLeap: template.isLeap},
      end: after + template.post.length,
    };
  }
  return null;
}

/** The longest known word at `i` that ends where a word may end. */
function matchWord(
  s: string,
  i: number,
  lex: CalendarDateLexicon,
): string | null {
  for (const word of lex.vocabulary) {
    if (!s.startsWith(word, i)) {
      continue;
    }
    const next = s[i + word.length] ?? '';
    const last = word[word.length - 1];
    if (
      !LETTER.test(next) ||
      SPACELESS.test(next) ||
      SPACELESS.test(last) ||
      !LETTER.test(last)
    ) {
      return word;
    }
  }
  return null;
}

/**
 * A known word joined to the next one with no space, such as Hebrew ב before
 * a month name or a leap marker after it ("Eighth Monthbis").
 */
function matchJoinedWord(
  s: string,
  i: number,
  lex: CalendarDateLexicon,
): string | null {
  for (const word of lex.vocabulary) {
    if (!s.startsWith(word, i)) {
      continue;
    }
    const next = i + word.length;
    if (lex.vocabulary.some(w => s.startsWith(w, next))) {
      return word;
    }
  }
  return null;
}

function wordToken(word: string, lex: CalendarDateLexicon): Token {
  const isWeekday = lex.weekdays.has(word.replace(NOT_WORDS, ''));
  const codes = lex.months.get(word);
  if (codes != null) {
    return {t: 'month', codes, isWeekday};
  }
  const era = lex.eras.get(word);
  if (era != null) {
    return {t: 'era', code: era, isWeekday};
  }
  if (lex.leapMarkers.has(word)) {
    return {t: 'leap'};
  }
  const alias = lex.yearAliases.get(word);
  if (alias != null) {
    return {t: 'num', v: alias, isAlias: true};
  }
  return {t: 'word', isYearMarker: lex.yearMarkers.has(word)};
}

/** The month a typed abbreviation names when it starts only one month name. */
function monthByPrefix(
  run: string,
  lex: CalendarDateLexicon,
): ReadonlySet<string> | null {
  if (run.length < 3) {
    return null;
  }
  let found: ReadonlySet<string> | null = null;
  for (const [name, codes] of lex.months) {
    if (name.startsWith(run)) {
      if (found != null && !sameCodes(found, codes)) {
        return null;
      }
      found = codes;
    }
  }
  return found;
}

/**
 * A weekday word can also be a month or era name, such as French "mar.". When
 * the text has another month or era, the first such word is the weekday.
 */
function weekdaysAsWords(tokens: Token[]): Token[] {
  let out = tokens;
  for (const kinds of [['month', 'monthNum'], ['era']]) {
    const named = out.filter(t => kinds.includes(t.t));
    const weekday = named.find(t => 'isWeekday' in t && t.isWeekday);
    if (named.length > 1 && weekday != null) {
      out = out.map(t => (t === weekday ? {t: 'word'} : t));
    }
  }
  return out;
}

function sameCodes(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every(code => b.has(code));
}

// =============================================================================
// Parsing
// =============================================================================

const INCOMPLETE: CalendarDateParseResult = {kind: 'incomplete'};
const UNREADABLE: CalendarDateParseResult = {kind: 'unreadable'};
const EMPTY: CalendarDateParseResult = {kind: 'empty'};

type DateFields = {
  -readonly [K in keyof CalendarDateFields]: CalendarDateFields[K];
};

/**
 * Reads typed text as a date in the lexicon's calendar. Values are Gregorian.
 * The result tells an empty field, part of a date, unreadable text, a date the
 * calendar does not have, a date out of range, and a date apart.
 */
export function parseCalendarDate(
  text: string,
  lex: CalendarDateLexicon,
  options: CalendarDateParseOptions = {},
): CalendarDateParseResult {
  const s = normalizeDateText(text, lex.locale).trim();
  if (!s) {
    return EMPTY;
  }
  const {isDateDisabled, isoIsGregorian = false} = options;
  if (isoIsGregorian) {
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (iso != null) {
      return finish(
        gregorianDate(+iso[1], +iso[2], +iso[3]),
        true,
        isDateDisabled,
      );
    }
  }
  const read = tokenize(s, lex);
  if (read === 'incomplete' || read === 'unreadable') {
    return read === 'incomplete' ? INCOMPLETE : UNREADABLE;
  }
  const tokens = weekdaysAsWords(read);
  const nums = tokens.filter(
    (token): token is Extract<Token, {t: 'num'}> => token.t === 'num',
  );
  const monthTokens = tokens.filter(
    token => token.t === 'month' || token.t === 'monthNum',
  );
  const eraCodes = new Set(
    tokens.flatMap(token => (token.t === 'era' ? [token.code] : [])),
  );
  const isLeap = tokens.some(
    token => token.t === 'leap' || (token.t === 'monthNum' && token.isLeap),
  );
  if (monthTokens.length > 1 || eraCodes.size > 1) {
    return UNREADABLE;
  }
  if (nums.length === 0 && monthTokens.length === 0) {
    return eraCodes.size > 0 ? INCOMPLETE : UNREADABLE;
  }
  const typedEra = eraCodes.size === 1 ? [...eraCodes][0] : undefined;

  const assigned = new Map<Token, DateField>();
  let monthCode: string | undefined;
  let monthOrdinal: number | undefined;
  const monthToken = monthTokens[0];
  if (monthToken != null) {
    if (monthToken.t === 'month') {
      if (monthToken.codes.size !== 1) {
        return UNREADABLE;
      }
      monthCode = [...monthToken.codes][0];
    } else if (lex.isNumericMonthOrdinal) {
      monthOrdinal = Number(monthToken.v);
    } else {
      monthCode = `M${monthToken.v.padStart(2, '0')}`;
    }
    if (nums.length === 0 || nums.length > 2) {
      return nums.length === 0 ? INCOMPLETE : UNREADABLE;
    }
    let rest = lex.nameOrder.filter(field => field !== 'month');
    const long = nums.filter(n => n.v.length >= 3 && !n.isAlias);
    if (nums.length === 1) {
      rest = long.length === 1 ? ['year'] : ['day'];
    } else if (long.length === 1) {
      // With a month name, a number of three or more digits is the year.
      rest = nums[0] === long[0] ? ['year', 'day'] : ['day', 'year'];
    }
    nums.forEach((n, k) => assigned.set(n, rest[k]));
  } else {
    if (nums.length < 2) {
      return INCOMPLETE;
    }
    if (nums.length > 3 || !sameSeparators(tokens, lex)) {
      return UNREADABLE;
    }
    let order: ReadonlyArray<DateField> =
      nums.length === 2
        ? lex.order.filter(field => field !== 'year')
        : lex.order;
    if (nums.length === 3 && order[0] !== 'year' && nums[0].v.length >= 3) {
      // ISO-shaped text: a leading long number is the year.
      order = ['year', 'month', 'day'];
    }
    if (nums.length === 2 && nums.some(n => n.v.length >= 3)) {
      return INCOMPLETE;
    }
    nums.forEach((n, k) => assigned.set(n, order[k]));
  }
  const tokenOf = (field: DateField) =>
    nums.find(n => assigned.get(n) === field);
  const dayToken = tokenOf('day');
  const yearToken = tokenOf('year');
  const monthNumToken = tokenOf('month');
  if (dayToken == null) {
    return INCOMPLETE;
  }
  if (monthNumToken != null) {
    if (lex.isNumericMonthOrdinal) {
      monthOrdinal = Number(monthNumToken.v);
    } else {
      monthCode = `M${String(Number(monthNumToken.v)).padStart(2, '0')}`;
    }
  }
  if (monthCode != null && isLeap && !monthCode.endsWith('L')) {
    monthCode += 'L';
  }
  const day = Number(dayToken.v);
  const monthNumber = monthOrdinal ?? Number(monthCode?.slice(1, 3) ?? 0);
  if (day < 1 || day > 31 || monthNumber < 1 || monthNumber > 13) {
    // A lone 0 starts a two-digit day or month such as 07.
    const startsField = [dayToken, monthNumToken].some(t => t?.v === '0');
    return startsField ? INCOMPLETE : UNREADABLE;
  }

  const today = options.today ?? plainDateToday();
  const dateFields: DateFields = {day};
  if (monthCode != null) {
    dateFields.monthCode = monthCode;
  } else {
    dateFields.month = monthOrdinal;
  }
  let isYearComplete = false;
  if (yearToken == null) {
    applyDefaultYear(dateFields, lex, today);
  } else {
    const digits = yearToken.isAlias ? 1 : yearToken.v.length;
    const year = Number(yearToken.v);
    const isYearLast = lastNumber(tokens) === yearToken;
    const {calendar} = lex;
    if (typedEra != null) {
      dateFields.era = typedEra;
      dateFields.eraYear = year;
      isYearComplete = true;
    } else if (calendar === 'japanese' && digits <= 2) {
      const era = currentEra(lex, today);
      if (era == null) {
        return UNREADABLE;
      }
      dateFields.era = era;
      dateFields.eraYear = year;
      isYearComplete = !isYearLast;
    } else if (calendar === 'japanese' && digits === 4) {
      dateFields.era = 'ce';
      dateFields.eraYear = year;
      isYearComplete = true;
    } else if (calendar === 'roc') {
      dateFields.era = 'roc';
      dateFields.eraYear = year;
      isYearComplete = digits >= 4 || !isYearLast;
    } else if (digits === 2) {
      dateFields.year = windowedYear(year, calendarYearOf(calendar, today));
    } else if (digits >= 4) {
      dateFields.year = year;
      isYearComplete = true;
    } else {
      return INCOMPLETE;
    }
  }

  const date = resolveDate(lex, dateFields);
  const isComplete =
    yearToken != null &&
    isYearComplete &&
    isLastFieldClosed(tokens, lex, assigned, date);
  return finish(date, isComplete, isDateDisabled);
}

function finish(
  date: PlainDate | null,
  isComplete: boolean,
  isDateDisabled: ((date: PlainDate) => boolean) | undefined,
): CalendarDateParseResult {
  if (date == null) {
    return {kind: 'nonexistent', isComplete};
  }
  if (isDateDisabled?.(date)) {
    return {kind: 'outOfRange', date, isComplete};
  }
  return {kind: 'value', date, isComplete};
}

/**
 * Whether the numbers share one separator. Two separators of the locale's own
 * numeric pattern also match, such as Hindi Buddhist "1/1`/2443".
 */
function sameSeparators(tokens: Token[], lex: CalendarDateLexicon): boolean {
  let previous: string | null = null;
  let seenNumber = false;
  let pending: string | null = null;
  for (const token of tokens) {
    if (token.t === 'num') {
      if (seenNumber) {
        const separator = pending ?? '';
        if (
          previous != null &&
          separator !== previous &&
          !(lex.separators.has(separator) && lex.separators.has(previous))
        ) {
          return false;
        }
        previous = separator;
      }
      seenNumber = true;
      pending = null;
    } else if (token.t === 'sep') {
      pending = token.v;
    } else {
      pending = null;
      seenNumber = false;
      previous = null;
    }
  }
  return true;
}

function lastNumber(tokens: Token[]): Token | undefined {
  const last = tokens.filter(token => token.t !== 'sep').at(-1);
  return last?.t === 'num' ? last : undefined;
}

/**
 * Whether the text has stopped growing: no separator trails it, and its last
 * field cannot take another digit.
 */
function isLastFieldClosed(
  tokens: Token[],
  lex: CalendarDateLexicon,
  assigned: ReadonlyMap<Token, DateField>,
  date: PlainDate | null,
): boolean {
  const last = tokens.at(-1);
  if (last == null) {
    return false;
  }
  if (last.t === 'sep') {
    return lex.trailers.has(last.v);
  }
  if (last.t !== 'num') {
    return true;
  }
  const field = assigned.get(last);
  if (field === 'year' || last.v.length >= 2) {
    return true;
  }
  const value = Number(last.v);
  if (field === 'day') {
    // Not the month's own length: a 3 can start a 30 that the month lacks,
    // and the field must then report that day, not the 3rd.
    return value * 10 > 31;
  }
  const monthsInYear =
    date == null ? 13 : calendarMonthsInYear(lex.calendar, date);
  return value * 10 > monthsInYear;
}

/**
 * Resolves a two-digit year to the century that puts it at most 80 years
 * before and 19 years after the current year.
 */
function windowedYear(twoDigits: number, current: number): number {
  let year = current - (current % 100) + twoDigits;
  if (year > current + 19) {
    year -= 100;
  } else if (year < current - 80) {
    year += 100;
  }
  return year;
}

function currentEra(
  lex: CalendarDateLexicon,
  today: PlainDate,
): string | undefined {
  const {era} = calendarEraYear('en', lex.calendar, today);
  return lex.eras.get(normalizeDateText(era, lex.locale).trim());
}

function applyDefaultYear(
  fields: DateFields,
  lex: CalendarDateLexicon,
  today: PlainDate,
): void {
  if (lex.eraArithmetic.size > 0 && !WITHOUT_ERA.has(lex.calendar)) {
    const {era, year} = calendarEraYear('en', lex.calendar, today);
    const code = lex.eras.get(normalizeDateText(era, lex.locale).trim());
    if (code != null) {
      fields.era = code;
      fields.eraYear = year;
      return;
    }
  }
  fields.year = calendarYearOf(lex.calendar, today);
}

function gregorianDate(
  year: number,
  month: number,
  day: number,
): PlainDate | null {
  if (
    year < 1 ||
    year > 9999 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > getDaysInMonth(year, month)
  ) {
    return null;
  }
  return {year, month, day};
}

/** The Gregorian date for calendar fields, or null when it does not exist. */
function resolveDate(
  lex: CalendarDateLexicon,
  fields: DateFields,
): PlainDate | null {
  const {calendar} = lex;
  if (!isGregorianAligned(calendar)) {
    const defined = Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined),
    ) as DateFields;
    const date = calendarDateFromFields(calendar, defined);
    return date != null && date.year >= 1 && date.year <= 9999 ? date : null;
  }
  if (fields.monthCode?.endsWith('L')) {
    return null;
  }
  const month = fields.month ?? Number(fields.monthCode?.slice(1, 3));
  let gregorianYear: number;
  if (fields.era != null) {
    const arithmetic = lex.eraArithmetic.get(fields.era);
    if (arithmetic == null || fields.eraYear == null || fields.eraYear < 1) {
      return null;
    }
    gregorianYear = arithmetic.isForward
      ? arithmetic.base + fields.eraYear
      : arithmetic.base - fields.eraYear;
  } else {
    const defaultEra = calendar === 'buddhist' ? 'be' : 'ce';
    const arithmetic = lex.eraArithmetic.get(defaultEra);
    gregorianYear = (arithmetic?.base ?? 0) + (fields.year ?? 0);
  }
  const date = gregorianDate(gregorianYear, month, fields.day);
  if (date == null || calendar !== 'japanese' || fields.era === 'ce') {
    return date;
  }
  // Each Japanese era ends on a set day; a year past it is not in that era.
  const written = calendarEraYear('en', calendar, date);
  const era = lex.eras.get(normalizeDateText(written.era, lex.locale).trim());
  return era === fields.era && written.year === fields.eraYear ? date : null;
}

// =============================================================================
// Display
// =============================================================================

const displayOptionCache = new WeakMap<
  Intl.DateTimeFormatOptions,
  Map<string, Intl.DateTimeFormatOptions>
>();

const eraChangeCache = new Map<CalendarSystem, boolean>();

/**
 * Whether the era changes between 1900 and 2100. Only then can a year without
 * its era read as two dates.
 */
function hasEraChange(calendar: CalendarSystem): boolean {
  let result = eraChangeCache.get(calendar);
  if (result == null) {
    const eraOf = (date: PlainDate) =>
      calendarEraYear('en', calendar, date).era;
    result =
      eraOf({year: 1900, month: 1, day: 1}) !==
      eraOf({year: 2100, month: 12, day: 31});
    eraChangeCache.set(calendar, result);
  }
  return result;
}

/**
 * Adds the era to a format that omits it, so a year never reads as a
 * Gregorian year. Keeps the locale's own pattern when the era would reorder
 * the fields. Where the era changes, it uses a narrow era that keeps the
 * order instead, such as Amharic Japanese "1/1/8 R".
 */
function displayOptions(
  locale: Locale,
  calendar: CalendarSystem,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormatOptions {
  if (WITHOUT_ERA.has(calendar)) {
    return options;
  }
  let byLocale = displayOptionCache.get(options);
  if (byLocale == null) {
    byLocale = new Map();
    displayOptionCache.set(options, byLocale);
  }
  const key = `${locale}|${calendar}`;
  let result = byLocale.get(key);
  if (result == null) {
    const sample = {year: 2026, month: 11, day: 2};
    const parts = partsOf(locale, calendar, options, sample);
    result = options;
    const order = fieldOrder(parts).join();
    if (!parts.some(p => p.type === 'era')) {
      const widths = hasEraChange(calendar)
        ? (['short', 'narrow'] as const)
        : (['short'] as const);
      for (const era of widths) {
        const withEra = {...options, era};
        const eraParts = partsOf(locale, calendar, withEra, sample);
        if (fieldOrder(eraParts).join() === order) {
          result = withEra;
          break;
        }
      }
    }
    byLocale.set(key, result);
  }
  return result;
}

function formatInCalendar(
  pd: PlainDate,
  options: Intl.DateTimeFormatOptions,
  locale: Locale,
  calendar: CalendarSystem,
): string {
  if (LUNISOLAR.has(calendar)) {
    return formatCalendarDate(calendar, pd, options, locale, {
      relatedYear: true,
    });
  }
  const display = displayOptions(locale, calendar, options);
  const text = plainDateFormat(pd, {...display, calendar}, locale);
  // When every era width reorders the fields, such as the Amharic short-month
  // date, the text has no era. Text without an era reads in the latest era.
  // So a date of an earlier era adds the era. It goes at the start or the
  // end, as in the era format.
  const eraOf = (date: PlainDate) => calendarEraYear('en', calendar, date).era;
  if (
    !hasEraChange(calendar) ||
    eraOf(pd) === eraOf({year: 9999, month: 12, day: 31}) ||
    partsOf(locale, calendar, display, pd).some(p => p.type === 'era')
  ) {
    return text;
  }
  const withEra = partsOf(locale, calendar, {...options, era: 'short'}, pd);
  const at = withEra.findIndex(p => p.type === 'era');
  const era = withEra
    .slice(at === 0 ? 0 : at - 1, at === 0 ? 2 : at + 1)
    .map(p => p.value)
    .join('');
  return at === 0 ? era + text : text + era;
}

/**
 * The committed text of a date field in a calendar. Gregorian text is the
 * shared Timestamp date text; `system_date` is always the ISO date.
 */
export function formatCalendarDateText(
  pd: PlainDate,
  format: SharedDateFormat,
  locale: Locale,
  calendar: CalendarSystem,
): string {
  const resolved = textCalendar(calendar);
  if (format === 'system_date' || resolved === 'gregory') {
    return formatSharedDate(pd, format, locale);
  }
  return formatInCalendar(
    pd,
    SHARED_DATE_FORMAT_OPTIONS[format],
    locale,
    resolved,
  );
}

/** An example date in the calendar's numeric pattern, with its era. */
export function formatCalendarDateHint(
  pd: PlainDate,
  locale: Locale,
  calendar: CalendarSystem,
): string {
  return formatInCalendar(pd, NUMERIC, locale, textCalendar(calendar));
}

/** The calendar's name in the locale, such as "Persian Calendar". */
export function calendarDisplayName(
  calendar: CalendarSystem,
  locale: Locale,
): string {
  try {
    return (
      new Intl.DisplayNames(locale, {type: 'calendar'}).of(calendar) ?? calendar
    );
  } catch {
    return calendar;
  }
}
