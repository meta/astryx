// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file timeFormat.test.ts
 * @input Uses vitest and the timeFormat helpers
 * @output Unit tests for locale hour cycles, locale time text, and parsing it back
 * @position Testing; validates utils/timeFormat.ts
 *
 * SYNC: When timeFormat.ts changes, update tests to match new behavior
 */

import {describe, expect, it} from 'vitest';
import {
  formatLocaleTime,
  parseLocaleTime,
  resolveHourFormat,
  type HourFormat,
} from './timeFormat';
import {parseTimeInput, type ISOTimeString} from './timeParser';

const iso = (time: string) => time as ISOTimeString;

describe('resolveHourFormat', () => {
  it.each([
    ['en', '12h'],
    ['en-US', '12h'],
    ['ko-KR', '12h'],
    ['en-GB', '24h'],
    ['de-DE', '24h'],
    ['vi-VN', '24h'],
    ['fr-FR', '24h'],
  ] as const)('reads the hour cycle of %s as %s', (locale, expected) => {
    expect(resolveHourFormat(locale)).toBe(expected);
  });

  it('honors a -u-hc- preference carried on the locale tag', () => {
    expect(resolveHourFormat('en-US-u-hc-h23')).toBe('24h');
    expect(resolveHourFormat('de-DE-u-hc-h12')).toBe('12h');
  });

  it('lets an explicit hour format win over the locale', () => {
    expect(resolveHourFormat('de-DE', '12h')).toBe('12h');
    expect(resolveHourFormat('en-US', '24h')).toBe('24h');
  });

  it('falls back to twelve-hour for a malformed tag', () => {
    expect(resolveHourFormat('not a locale')).toBe('12h');
  });
});

describe('formatLocaleTime', () => {
  it('keeps the released English text exactly, with a plain space', () => {
    expect(formatLocaleTime(iso('14:30'), 'en', '12h')).toBe('2:30 PM');
    expect(formatLocaleTime(iso('00:05'), 'en', '12h')).toBe('12:05 AM');
    expect(formatLocaleTime(iso('14:30:05'), 'en', '12h', true)).toBe(
      '2:30:05 PM',
    );
    expect(formatLocaleTime(iso('09:05'), 'en', '24h')).toBe('09:05');
    expect(formatLocaleTime(iso('09:05:07'), 'en', '24h', true)).toBe(
      '09:05:07',
    );
  });

  it("uses the locale's day-period words and their position", () => {
    expect(formatLocaleTime(iso('14:30'), 'ko-KR', '12h')).toBe('오후 2:30');
    expect(formatLocaleTime(iso('09:05'), 'zh-CN', '12h')).toBe('上午9:05');
    expect(formatLocaleTime(iso('14:30'), 'es-ES', '12h')).toBe('2:30 p. m.');
  });

  it('writes noon as 12 in a twelve-hour reading, not 0', () => {
    expect(formatLocaleTime(iso('12:30'), 'ja-JP', '12h')).toBe('午後12:30');
  });

  it('writes English twelve-hour text when the locale would drop the day period', () => {
    // fr-CM's twelve-hour reading writes 02:30 and 14:30 both as "2:30".
    expect(formatLocaleTime(iso('14:30'), 'fr-CM', '12h')).toBe('2:30 PM');
    expect(formatLocaleTime(iso('02:30'), 'fr-CM', '12h')).toBe('2:30 AM');
    expect(formatLocaleTime(iso('14:30'), 'fr-CM', '24h')).toBe('14:30');
  });

  it("uses the locale's separator and digits", () => {
    expect(formatLocaleTime(iso('14:30'), 'fi-FI', '24h')).toBe('14.30');
    expect(formatLocaleTime(iso('14:30'), 'ar-EG', '12h')).toBe('٢:٣٠ م');
  });

  it('returns empty text for an empty or malformed time', () => {
    expect(formatLocaleTime(undefined, 'en', '12h')).toBe('');
    expect(formatLocaleTime(iso('25:00'), 'en', '12h')).toBe('');
  });
});

describe('parseLocaleTime', () => {
  const LOCALES = [
    'en-US',
    'en-GB',
    'de-DE',
    'fi-FI',
    'fr-CA',
    'es-ES',
    'sv-SE',
    'vi-VN',
    'ja-JP',
    'ko-KR',
    'zh-TW',
    'ar-EG',
    'fa-IR',
    'he-IL',
    // Twelve-hour readings whose separators or surrounding words differ from
    // the twenty-four-hour reading: a dot (as, nds), "h" (oc), a word between
    // the day period and the hour (brx, ee), a word before the hour (dz, nds,
    // tok), and Tibetan digits (dz).
    'as',
    'brx',
    'dz',
    'ee',
    'nds',
    'oc',
    'tok',
    // A one-letter day period that English input contains ("m" in "pm").
    'gd',
    // A twelve-hour reading with no day period at all.
    'fr-CM',
  ];
  const TIMES = ['00:00', '00:30', '09:05', '11:59', '12:00', '12:30', '23:45'];
  const FORMATS: HourFormat[] = ['12h', '24h'];

  it.each(LOCALES)('reads back every time %s writes', locale => {
    for (const hourFormat of FORMATS) {
      for (const time of TIMES) {
        const text = formatLocaleTime(iso(time), locale, hourFormat);
        expect(
          parseLocaleTime(text, locale),
          `${locale} ${hourFormat} "${text}"`,
        ).toBe(time);
      }
      const withSeconds = formatLocaleTime(
        iso('14:30:05'),
        locale,
        hourFormat,
        true,
      );
      expect(parseLocaleTime(withSeconds, locale, true)).toBe('14:30:05');
    }
  });

  it('reads a spaced day period as the half of the day it names', () => {
    // Previously parsed as 02:30: the English matcher missed "p. m.".
    expect(parseLocaleTime('2:30 p. m.', 'es-ES')).toBe('14:30');
    expect(parseLocaleTime('午後2:30', 'ja-JP')).toBe('14:30');
  });

  it('reads twelve-hour text whose pattern differs from the 24-hour one', () => {
    expect(parseLocaleTime('অপৰাহ্ন ২.৩০', 'as')).toBe('14:30');
    expect(parseLocaleTime('ɣetrɔ ga 2:30', 'ee')).toBe('14:30');
    expect(parseLocaleTime('Klock 2.30:05 PM', 'nds', true)).toBe('14:30:05');
    expect(parseLocaleTime('2h30:05 PM', 'oc', true)).toBe('14:30:05');
  });

  it("reads the locale's separator", () => {
    // Previously "14.30" read only its "14" prefix.
    expect(parseLocaleTime('14.30', 'fi-FI')).toBe('14:30');
    expect(parseLocaleTime('14 h 30', 'fr-CA')).toBe('14:30');
  });

  it('does not read a day-period word out of the middle of an English word', () => {
    // gd writes the morning as "m": the "m" of "pm" is not that word.
    expect(parseLocaleTime('2:30 PM', 'gd')).toBe('14:30');
    expect(parseLocaleTime('12:00 PM', 'gd')).toBe('12:00');
    expect(parseLocaleTime('2pm', 'gd')).toBe('14:00');
    expect(parseLocaleTime('2:30 p.m', 'gd')).toBe('14:30');
    expect(parseLocaleTime('12:00 p.m', 'gd')).toBe('12:00');
    expect(parseLocaleTime('2 p.m', 'gd')).toBe('14:00');
    expect(parseLocaleTime('11 a.m', 'gd')).toBe('11:00');
    expect(parseLocaleTime('2:30m', 'gd')).toBe('02:30');
  });

  it('still reads English input in every locale exactly as before', () => {
    const inputs = [
      '2:30 PM',
      '2:30 p.m',
      '2:30 p.m.',
      '12:00 PM',
      '12:00 AM',
      '2pm',
      '2 p.m',
      '11 a.m',
      '14:30',
      '1430',
    ];
    for (const locale of LOCALES) {
      for (const input of inputs) {
        expect(parseLocaleTime(input, locale), `${locale} "${input}"`).toBe(
          parseTimeInput(input),
        );
      }
    }
  });

  it('rejects text no reading fits', () => {
    expect(parseLocaleTime('', 'en-US')).toBeNull();
    expect(parseLocaleTime('25:99', 'de-DE')).toBeNull();
    expect(parseLocaleTime('午後14:30', 'ja-JP')).toBeNull();
  });
});
