// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file calendarDateParser.roundtrip.test.ts
 * @input Uses vitest, temporal-polyfill, calendarDateParser, calendarSystem
 * @output Round-trip matrix: every calendar's committed text and format hint
 *   in its native locale and others reads back as the same date
 * @position Testing; samples 1900 through 2100 for calendarDateParser.ts
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {Temporal as TemporalPolyfill} from 'temporal-polyfill/full';
import {
  formatCalendarDateText,
  formatCalendarDateHint,
  getCalendarDateLexicon,
  parseCalendarDate,
} from './calendarDateParser';
import type {CalendarSystem} from './calendarSystem';
import {plainDateAddDays, plainDateDiffDays} from './plainDate';
import type {PlainDate} from './dateTypes';

const host = globalThis as {Temporal?: unknown};
const hadTemporal = host.Temporal != null;
beforeAll(() => {
  host.Temporal ??= TemporalPolyfill;
});
afterAll(() => {
  if (!hadTemporal) {
    delete host.Temporal;
  }
});

const NATIVE_LOCALES: Readonly<Record<CalendarSystem, string>> = {
  gregory: 'en-GB',
  iso8601: 'en-CA',
  buddhist: 'th-TH',
  roc: 'zh-TW',
  japanese: 'ja-JP',
  persian: 'fa-IR',
  indian: 'hi-IN',
  hebrew: 'he',
  chinese: 'zh-CN',
  dangi: 'ko-KR',
  coptic: 'ar-EG',
  ethiopic: 'am-ET',
  ethioaa: 'am-ET',
  'islamic-civil': 'ar-EG',
  'islamic-tbla': 'ar',
  'islamic-umalqura': 'ar-SA',
};

// Weekday words that name months or eras, digit month names, cycle years,
// eras left out of a numeric pattern, numeric patterns with two separators.
const MORE_LOCALES: Partial<Record<CalendarSystem, string>> = {
  gregory: 'fr-FR it-IT es-ES ro-RO vi-VN',
  buddhist: 'fr-FR hi-IN',
  roc: 'de-DE am-ET',
  japanese: 'it-IT hu-HU am-ET',
  persian: 'nb-NO',
  hebrew: 'lv-LV',
  chinese: 'ca-ES cs-CZ de-DE fi-FI fr-FR it-IT nl-NL pl-PL pt-PT ru-RU',
  dangi: 'pt-BR fi-FI',
  ethiopic: 'pt-BR',
  'islamic-civil': 'fr-FR hu-HU sr-RS lv-LV',
  'islamic-tbla': 'lv-LV',
  'islamic-umalqura': 'lv-LV',
};

// Text in the lunisolar calendars costs far more to compose under the
// polyfill, so those calendars sample fewer days. Each locale starts on another weekday.
const FIRST = {year: 1900, month: 1, day: 1};
const DAYS = plainDateDiffDays(FIRST, {year: 2100, month: 12, day: 31});
const TODAY = {year: 2026, month: 11, day: 2};

function sampleDays(step: number, offset: number): PlainDate[] {
  const days: PlainDate[] = [];
  for (let day = offset; day <= DAYS; day += step) {
    days.push(plainDateAddDays(FIRST, day));
  }
  return days;
}

function failures(
  locale: string,
  calendar: CalendarSystem,
  dates: ReadonlyArray<PlainDate>,
) {
  const lexicon = getCalendarDateLexicon(locale, calendar);
  const failed: string[] = [];
  for (const date of dates) {
    const texts = [
      formatCalendarDateHint(date, locale, calendar),
      formatCalendarDateText(date, 'date', locale, calendar),
      formatCalendarDateText(date, 'date_long', locale, calendar),
      formatCalendarDateText(date, 'date_weekday', locale, calendar),
    ];
    for (const text of texts) {
      const result = parseCalendarDate(text, lexicon, {today: TODAY});
      const isSame =
        result.kind === 'value' &&
        result.date.year === date.year &&
        result.date.month === date.month &&
        result.date.day === date.day;
      if (!isSame && failed.length < 5) {
        failed.push(`${JSON.stringify(text)} -> ${JSON.stringify(result)}`);
      }
    }
  }
  return failed;
}

describe('committed text reads back as the same date (FR13)', () => {
  for (const [calendar, native] of Object.entries(NATIVE_LOCALES) as [
    CalendarSystem,
    string,
  ][]) {
    const isLunisolar = calendar === 'chinese' || calendar === 'dangi';
    it(`${calendar} in ${native}, en, and sv-SE`, () => {
      const step = isLunisolar ? 42 : 14;
      expect(failures(native, calendar, sampleDays(step, 0))).toEqual([]);
      expect(failures('en', calendar, sampleDays(step * 3, 2))).toEqual([]);
      expect(failures('sv-SE', calendar, sampleDays(step * 3, 4))).toEqual([]);
    });
  }
  it.each(Object.entries(MORE_LOCALES))('%s in %s', (calendar, locales) => {
    for (const locale of locales.split(' ')) {
      expect(
        failures(locale, calendar as CalendarSystem, sampleDays(997, 1)),
      ).toEqual([]);
    }
  });
  // Month names that start with a number, an era that the locale's numeric
  // pattern leaves out, and a numeric pattern with two separators.
  it.each<[string, CalendarSystem, ...[number, number, number][]]>([
    ['lv-LV', 'hebrew', [1900, 2, 1], [1900, 3, 2], [1901, 2, 20]],
    ['lv-LV', 'islamic-civil', [1900, 7, 1], [1900, 8, 26]],
    ['am-ET', 'roc', [1900, 1, 1], [1911, 12, 31], [1912, 1, 1], [2026, 1, 1]],
    ['ksh', 'roc', [1900, 1, 1], [1912, 1, 1]],
    [
      'am-ET',
      'japanese',
      [1900, 1, 1],
      [1950, 6, 15],
      [2000, 6, 15],
      [2019, 5, 1],
      [2026, 1, 1],
    ],
    ['hi-IN', 'buddhist', [1900, 1, 1], [2026, 11, 2]],
  ])('%s %s', (locale, calendar, ...dates) => {
    const days = dates.map(([year, month, day]) => ({year, month, day}));
    expect(failures(locale, calendar, days)).toEqual([]);
  });
  it.each([
    ['86. g. 1. adars', {year: 2026, month: 2, day: 18}],
    ['26. g. 1. adars', {year: 1966, month: 2, day: 21}],
  ])('reads a two-digit year before a Latvian month name: %s', (text, date) => {
    const lexicon = getCalendarDateLexicon('lv-LV', 'hebrew');
    const today = {year: 2026, month: 11, day: 2};
    expect(parseCalendarDate(text, lexicon, {today})).toMatchObject({date});
  });
  it('writes the narrow era in the Amharic numeric pattern', () => {
    const hint = (year: number, calendar: CalendarSystem) =>
      formatCalendarDateHint({year, month: 1, day: 1}, 'am-ET', calendar);
    expect(hint(2026, 'japanese')).toBe('1/1/8 R');
    expect(hint(1990, 'japanese')).toBe('1/1/2 H');
    // Amharic writes the Minguo eras as "R.O.C." and "Before R.O.C." in CLDR
    // 47, and as "ROC" and "BROC" in CLDR 48. Any other version expects the
    // CLDR 48 names.
    const isCldr47 = process.versions.cldr?.startsWith('47.') ?? false;
    expect(hint(2026, 'roc')).toBe(isCldr47 ? '1/1/115 R.O.C.' : '1/1/115 ROC');
    expect(hint(1900, 'roc')).toBe(
      isCldr47 ? '1/1/12 Before R.O.C.' : '1/1/12 BROC',
    );
  });
  it('adds no era to a calendar whose era does not change', () => {
    const day = {year: 2026, month: 1, day: 1};
    expect(formatCalendarDateHint(day, 'am-ET', 'ethiopic')).toBe('23/4/2018');
    expect(
      formatCalendarDateHint({year: 2026, month: 11, day: 2}, 'tk', 'buddhist'),
    ).toBe('02.11.2569');
  });
});
