// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  compactNumber,
  currency,
  monthYear,
  percent,
  shortDate,
} from './formatters';

describe('chart formatters', () => {
  it('formats numbers with the requested locale and keeps caches locale-keyed', () => {
    const en = compactNumber(1_500_000, 'en-US');
    const de = compactNumber(1_500_000, 'de-DE');

    expect(en).toBe(
      new Intl.NumberFormat('en-US', {
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(1_500_000),
    );
    expect(de).toBe(
      new Intl.NumberFormat('de-DE', {
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(1_500_000),
    );
    expect(de).not.toBe(en);
    expect(compactNumber(1_500_000, 'en-US')).toBe(en);
  });

  it('formats currency and percentages with the requested locale', () => {
    expect(currency('€', 'de-DE')(1234.5)).toBe(
      `€${new Intl.NumberFormat('de-DE', {
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(1234.5)}`,
    );
    expect(percent(0.125, 'de-DE')).toBe(
      new Intl.NumberFormat('de-DE', {
        style: 'percent',
        maximumFractionDigits: 1,
      }).format(0.125),
    );
  });

  it('preserves the legacy symbol-only currency call', () => {
    expect(() => currency('€')(1234.5)).not.toThrow();
    expect(currency('€')(1234.5)).toMatch(/^€/);
  });

  it('formats dates with the requested locale', () => {
    const value = '2024-01-05';
    expect(shortDate(value, 'de-DE')).toBe(
      new Intl.DateTimeFormat('de-DE', {
        month: 'short',
        day: 'numeric',
      }).format(new Date(2024, 0, 5)),
    );
    expect(monthYear(value, 'de-DE')).toBe(
      new Intl.DateTimeFormat('de-DE', {
        month: 'short',
        year: 'numeric',
      }).format(new Date(2024, 0, 5)),
    );
    expect(shortDate(value, 'de-DE')).not.toBe(shortDate(value, 'en-US'));
  });

  it('keeps Gregorian dates for locales that default to another calendar', () => {
    const value = '2026-08-22';
    const date = new Date(2026, 7, 22);
    expect(shortDate(value, 'fa-IR')).toBe(
      new Intl.DateTimeFormat('fa-IR', {
        month: 'short',
        day: 'numeric',
        calendar: 'gregory',
      }).format(date),
    );
    expect(monthYear(value, 'th-TH')).toBe(
      new Intl.DateTimeFormat('th-TH', {
        month: 'short',
        year: 'numeric',
        calendar: 'gregory',
      }).format(date),
    );
  });

  it.each([
    {calendar: 'persian', locale: 'en', year: '1405'},
    {calendar: 'persian', locale: 'fa', year: '۱۴۰۵'},
    {calendar: 'hebrew', locale: 'en', year: '5787'},
    {calendar: 'hebrew', locale: 'he', year: '5787'},
    {calendar: 'buddhist', locale: 'en', year: '2569'},
    {calendar: 'buddhist', locale: 'th', year: '2569'},
  ] as const)(
    'formats dates in an explicit $calendar calendar under $locale',
    ({calendar, locale, year}) => {
      const value = '2026-10-30';
      const date = new Date(2026, 9, 30);
      expect(shortDate(value, locale, calendar)).toBe(
        new Intl.DateTimeFormat(locale, {
          month: 'short',
          day: 'numeric',
          calendar,
        }).format(date),
      );
      const label = monthYear(value, locale, calendar);
      expect(label).toBe(
        new Intl.DateTimeFormat(locale, {
          month: 'short',
          year: 'numeric',
          calendar,
        }).format(date),
      );
      expect(label).toContain(year);
      expect(label).not.toContain('2026');
    },
  );

  it('keeps one cached formatter per locale and calendar', () => {
    const value = '2026-10-30';
    expect(monthYear(value, 'en', 'persian')).not.toBe(
      monthYear(value, 'en', 'gregory'),
    );
    expect(monthYear(value, 'en')).toBe(monthYear(value, 'en', 'gregory'));
    expect(monthYear(value, 'en')).toContain('2026');
  });

  it('passes through non-finite and unparseable values', () => {
    expect(compactNumber(Infinity, 'en-US')).toBe('Infinity');
    expect(percent('not-a-number', 'en-US')).toBe('not-a-number');
    expect(shortDate('not-a-date', 'en-US')).toBe('not-a-date');
    expect(monthYear(null, 'en-US')).toBe('null');
  });
});
