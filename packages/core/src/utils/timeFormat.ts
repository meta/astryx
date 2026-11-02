// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file timeFormat.ts
 * @input An ISO time or typed text, plus the provider's BCP 47 locale
 * @output Exports resolveHourFormat, formatLocaleTime, and parseLocaleTime
 * @position Internal shared helper for TimeInput and DateTimeInput; not part
 *   of the public surface
 *
 * Time of day as the locale writes it. The hour cycle, digits, separator, and
 * day-period words all come from Intl rather than a table, so a field reads
 * the same way `Timestamp` does beside it.
 *
 * The hour cycle is the locale's own: `en-US` and `ko-KR` read twelve-hour,
 * `en-GB`, `de-DE`, and `vi-VN` read twenty-four-hour. A `-u-hc-` extension
 * on the provider locale (`en-US-u-hc-h23`) carries an app's per-user
 * preference through the same path, so every Astryx time honors it.
 *
 * The parser reads back what the formatter writes: the locale's digits, its
 * hour-minute separator, and its day-period words, on either side of the time.
 * Whatever is left goes through the shared English-tolerant parser, so "2:30
 * PM" and "14:30" keep working in every locale.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/utils/timeFormat.test.ts
 * - /packages/core/src/TimeInput/TimeInput.tsx
 * - /packages/core/src/DateTimeInput/DateTimeInput.tsx
 */

import type {Locale} from '../i18n/types';
import {parseISOTime, parseTimeInput, type ISOTimeString} from './timeParser';
import {INVISIBLE_CHARS, toAsciiDigits} from './unicodeDigits';

export type HourFormat = '12h' | '24h';

interface LocaleTimeSymbols {
  hourFormat: HourFormat;
  /**
   * The text between hour and minute and between minute and second, trimmed:
   * ":" nearly everywhere, "." in fi-FI, "h" and "min" in fr-CA. Read from
   * both readings, because some locales write them differently: `as` writes
   * "১৪:৩০" but "অপৰাহ্ন ২.৩০".
   */
  separators: string[];
  /**
   * Words the locale writes before or after the digits other than the day
   * period, trimmed: "s" after fr-CA seconds, "kl." before nds-DE times, "ga"
   * between an ee day period and its hour. Longest first.
   */
  edgeWords: string[];
  /** Every day-period word the locale writes, longest first. */
  dayPeriods: {word: string; isPM: boolean}[];
  /**
   * The locale's twelve-hour reading writes 02:00 and 14:00 the same (fr-CM
   * writes no day period), so its twelve-hour text is English instead.
   */
  twelveHourIsAmbiguous: boolean;
}

const symbolsByLocale = new Map<string, LocaleTimeSymbols>();

// The space family Intl writes between a time and its day period ("2:30 PM"
// uses U+202F). A typed field shows a plain space so people can edit it.
const SPACES = /[\u00A0\u2007\u202F]/g;
// What may sit on a peeled word's inner side: a digit (digits are already
// ASCII here), whitespace, or nothing.
const WORD_BOUNDARY = /^[\d\s]?$/;

function utcDate(hour: number, minute: number, second: number): Date {
  return new Date(Date.UTC(2000, 0, 1, hour, minute, second));
}

function timeFormatter(
  locale: Locale,
  hourFormat: HourFormat,
  includeSeconds: boolean,
): Intl.DateTimeFormat {
  const options: Intl.DateTimeFormatOptions = {
    hour: hourFormat === '12h' ? 'numeric' : '2-digit',
    minute: '2-digit',
    second: includeSeconds ? '2-digit' : undefined,
    // `hourCycle`, not `hour12`: `hour12: true` resolves to h11 in ja-JP and
    // writes noon as "午後0:30".
    hourCycle: hourFormat === '12h' ? 'h12' : 'h23',
    timeZone: 'UTC',
  };
  try {
    return new Intl.DateTimeFormat(locale, options);
  } catch {
    return new Intl.DateTimeFormat('en', options);
  }
}

function getLocaleTimeSymbols(locale: Locale): LocaleTimeSymbols {
  let symbols = symbolsByLocale.get(locale);
  if (symbols !== undefined) {
    return symbols;
  }

  let hourFormat: HourFormat;
  let resolved: Intl.ResolvedDateTimeFormatOptions;
  try {
    resolved = new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
    }).resolvedOptions();
  } catch {
    // A malformed tag formats as English everywhere else in this module.
    resolved = new Intl.DateTimeFormat('en', {
      hour: 'numeric',
    }).resolvedOptions();
  }
  if (resolved.hourCycle !== undefined) {
    hourFormat =
      resolved.hourCycle === 'h11' || resolved.hourCycle === 'h12'
        ? '12h'
        : '24h';
  } else {
    // Engines that leave hourCycle unresolved still write a day period for a
    // twelve-hour locale when no cycle is forced.
    let ambient: Intl.DateTimeFormat;
    try {
      ambient = new Intl.DateTimeFormat(locale, {hour: 'numeric'});
    } catch {
      ambient = new Intl.DateTimeFormat('en', {hour: 'numeric'});
    }
    hourFormat = ambient
      .formatToParts(utcDate(13, 0, 0))
      .some(part => part.type === 'dayPeriod')
      ? '12h'
      : '24h';
  }

  // Literals of every reading this module writes: twelve- and twenty-four-hour,
  // with and without seconds. A literal between two numbers is a separator;
  // one outside them is an edge word.
  const separatorSet = new Set<string>();
  const edgeSet = new Set<string>();
  for (const cycle of ['12h', '24h'] as const) {
    for (const withSeconds of [false, true]) {
      const parts = timeFormatter(locale, cycle, withSeconds).formatToParts(
        utcDate(13, 30, 5),
      );
      const isNumber = (part: Intl.DateTimeFormatPart) =>
        part.type === 'hour' ||
        part.type === 'minute' ||
        part.type === 'second';
      const first = parts.findIndex(isNumber);
      const last = parts.length - 1 - [...parts].reverse().findIndex(isNumber);
      parts.forEach((part, index) => {
        if (part.type !== 'literal') {
          return;
        }
        const text = normalizeText(part.value).trim();
        if (text === '' || text === ':') {
          return;
        }
        (index > first && index < last ? separatorSet : edgeSet).add(text);
      });
    }
  }
  const separators = [...separatorSet];
  const edgeWords = [...edgeSet].sort((a, b) => b.length - a.length);

  // Every hour, because some locales name several periods across the day
  // (flexible day periods). A word that appears on both sides of noon cannot
  // say which half it means, so it is left out.
  const twelveHour = timeFormatter(locale, '12h', false);
  const sides = new Map<string, Set<boolean>>();
  for (let hour = 0; hour < 24; hour++) {
    const word = twelveHour
      .formatToParts(utcDate(hour, 0, 0))
      .find(part => part.type === 'dayPeriod')?.value;
    if (word === undefined) {
      continue;
    }
    const key = normalizeText(word).trim();
    if (key === '') {
      continue;
    }
    const seen = sides.get(key) ?? new Set<boolean>();
    seen.add(hour >= 12);
    sides.set(key, seen);
  }
  const dayPeriods = [...sides]
    .filter(([, seen]) => seen.size === 1)
    .map(([word, seen]) => ({word, isPM: seen.has(true)}))
    .sort((a, b) => b.word.length - a.word.length);

  const twelveHourIsAmbiguous =
    normalizeText(twelveHour.format(utcDate(2, 0, 0))) ===
    normalizeText(twelveHour.format(utcDate(14, 0, 0)));

  symbols = {
    hourFormat,
    separators,
    edgeWords,
    dayPeriods,
    twelveHourIsAmbiguous,
  };
  symbolsByLocale.set(locale, symbols);
  return symbols;
}

function normalizeText(text: string): string {
  const folded = text
    .normalize('NFKC')
    .replace(INVISIBLE_CHARS, '')
    .replace(SPACES, ' ');
  return (toAsciiDigits(folded) ?? folded).toLowerCase();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The hour format a field shows: the caller's explicit choice, else the
 * locale's hour cycle (including a `-u-hc-` extension on the tag).
 */
export function resolveHourFormat(
  locale: Locale,
  hourFormat?: HourFormat,
): HourFormat {
  return hourFormat ?? getLocaleTimeSymbols(locale).hourFormat;
}

/**
 * Formats an ISO time as the locale writes it, in the given hour format.
 * en-US: "14:30" → "2:30 PM"; de-DE 24h: "14:30"; ko-KR 12h: "오후 2:30".
 * Returns '' for an empty or malformed time.
 */
export function formatLocaleTime(
  time: ISOTimeString | undefined,
  locale: Locale,
  hourFormat: HourFormat,
  includeSeconds: boolean = false,
): string {
  if (!time) {
    return '';
  }
  const parsed = parseISOTime(time);
  if (!parsed) {
    return '';
  }
  const formatLocale =
    hourFormat === '12h' && getLocaleTimeSymbols(locale).twelveHourIsAmbiguous
      ? 'en'
      : locale;
  return timeFormatter(formatLocale, hourFormat, includeSeconds)
    .format(utcDate(parsed.hour, parsed.minute, parsed.second))
    .replace(SPACES, ' ');
}

/**
 * Parses typed text into an ISO time, accepting the locale's digits,
 * separator, and day-period words as well as everything `parseTimeInput`
 * accepts. Returns null when no reading fits.
 */
export function parseLocaleTime(
  input: string,
  locale: Locale,
  includeSeconds: boolean = false,
): ISOTimeString | null {
  if (!input) {
    return null;
  }
  const {separators, edgeWords, dayPeriods} = getLocaleTimeSymbols(locale);
  let text = normalizeText(input).trim();

  // Peel the day period and edge words off both ends, in whatever order the
  // locale writes them ("ŋdi ga 2:30", "kl. 2.30 pm").
  let isPM: boolean | null = null;
  // A word counts only when a digit, whitespace, or nothing sits on its inner
  // side, so gd's "m" (morning) is not read out of an English "pm" or "p.m".
  const strip = (word: string) => {
    if (text.startsWith(word) && WORD_BOUNDARY.test(text.charAt(word.length))) {
      text = text.slice(word.length).trim();
      return true;
    }
    if (
      text.endsWith(word) &&
      WORD_BOUNDARY.test(text.charAt(text.length - word.length - 1))
    ) {
      text = text.slice(0, -word.length).trim();
      return true;
    }
    return false;
  };
  for (let peeled = true; peeled;) {
    peeled = false;
    if (isPM === null) {
      const period = dayPeriods.find(({word}) => strip(word));
      if (period !== undefined) {
        isPM = period.isPM;
        peeled = true;
      }
    }
    if (edgeWords.some(strip)) {
      peeled = true;
    }
  }

  for (const separator of separators) {
    text = text.replace(
      new RegExp(`(\\d)\\s*${escapeRegExp(separator)}\\s*(?=\\d)`, 'g'),
      '$1:',
    );
  }

  if (isPM !== null) {
    text = `${text} ${isPM ? 'pm' : 'am'}`;
  }
  return parseTimeInput(text, includeSeconds);
}
