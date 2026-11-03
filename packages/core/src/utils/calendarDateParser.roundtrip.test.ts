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

// Weekday words that name months or eras, digit month names, cycle years.
const MORE_LOCALES: Partial<Record<CalendarSystem, string>> = {
  gregory: 'fr-FR it-IT es-ES ro-RO vi-VN',
  buddhist: 'fr-FR',
  roc: 'de-DE',
  japanese: 'it-IT hu-HU',
  persian: 'nb-NO',
  chinese: 'ca-ES cs-CZ de-DE fi-FI fr-FR it-IT nl-NL pl-PL pt-PT ru-RU',
  dangi: 'pt-BR fi-FI',
  ethiopic: 'pt-BR',
  'islamic-civil': 'fr-FR hu-HU sr-RS',
};

// Chinese and Korean text costs far more to compose under the polyfill, so
// those calendars sample fewer days. Each locale starts on another weekday.
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
  step: number,
  offset: number,
) {
  const lexicon = getCalendarDateLexicon(locale, calendar);
  const failed: string[] = [];
  for (const date of sampleDays(step, offset)) {
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
      expect(failures(native, calendar, step, 0)).toEqual([]);
      expect(failures('en', calendar, step * 3, 2)).toEqual([]);
      expect(failures('sv-SE', calendar, step * 3, 4)).toEqual([]);
    });
  }
  it.each(Object.entries(MORE_LOCALES))('%s in %s', (calendar, locales) => {
    for (const locale of locales.split(' ')) {
      expect(failures(locale, calendar as CalendarSystem, 997, 1)).toEqual([]);
    }
  });
});
