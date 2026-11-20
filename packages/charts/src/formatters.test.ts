// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {CalendarSystem, Locale} from '@astryxdesign/core/i18n';
import {describe, expect, expectTypeOf, it} from 'vitest';
import {
  compactNumber,
  currency,
  monthYear,
  percent,
  shortDate,
} from './formatters';
import type {ChartValueFormat} from './index';

function compactIntl(locale: Locale, value: number): string {
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

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

  it('defaults to Gregorian and writes `iso8601` dates as Gregorian ones', () => {
    const value = '2026-10-30';
    expect(monthYear(value, 'en')).toBe('Oct 2026');
    expect(monthYear(value, 'en', 'iso8601')).toBe('Oct 2026');
    expect(shortDate(value, 'en', 'iso8601')).toBe(shortDate(value, 'en'));
  });

  it('passes through non-finite and unparseable values', () => {
    expect(compactNumber(Infinity, 'en-US')).toBe('Infinity');
    expect(percent('not-a-number', 'en-US')).toBe('not-a-number');
    expect(shortDate('not-a-date', 'en-US')).toBe('not-a-date');
    expect(monthYear('not-a-date', 'en-US')).toBe('not-a-date');
  });
});

describe('chart formatters as chart value formats', () => {
  const builtIns: ReadonlyArray<[string, ChartValueFormat]> = [
    ['compactNumber', compactNumber],
    ['percent', percent],
    ['shortDate', shortDate],
    ['monthYear', monthYear],
    ["currency('$')", currency('$')],
    ["currency('$', 'en-US')", currency('$', 'en-US')],
  ];

  it.each(builtIns)(
    '%s returns undefined for null and undefined',
    (_name, format) => {
      expect(format(null, 'en-US', 'gregory')).toBeUndefined();
      expect(format(undefined, 'en-US', 'gregory')).toBeUndefined();
    },
  );

  it('keeps the output for present values, zero included', () => {
    expect(compactNumber(0, 'en-US')).toBe(compactIntl('en-US', 0));
    expect(percent(0, 'en-US')).toBe(
      new Intl.NumberFormat('en-US', {style: 'percent'}).format(0),
    );
    expect(currency('$', 'en-US')(0)).toBe(
      `$${new Intl.NumberFormat('en-US').format(0)}`,
    );
    expect(monthYear('2024-01-05', 'en-US')).toBe(
      new Intl.DateTimeFormat('en-US', {
        month: 'short',
        year: 'numeric',
      }).format(new Date(2024, 0, 5)),
    );
  });

  it('types present inputs as string and empty inputs as undefined', () => {
    const value: unknown = 1;
    expectTypeOf(compactNumber(1, 'en')).toEqualTypeOf<string>();
    expectTypeOf(percent(0.5, 'en')).toEqualTypeOf<string>();
    expectTypeOf(shortDate('2024-01-05', 'en')).toEqualTypeOf<string>();
    expectTypeOf(
      monthYear(new Date(), 'en', 'persian'),
    ).toEqualTypeOf<string>();
    expectTypeOf(currency('$')(1)).toEqualTypeOf<string>();
    expectTypeOf(currency('$')(1, 'en')).toEqualTypeOf<string>();
    expectTypeOf(compactNumber(null, 'en')).toEqualTypeOf<undefined>();
    expectTypeOf(currency('$')(undefined)).toEqualTypeOf<undefined>();
    expectTypeOf(compactNumber(value, 'en')).toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf(currency('$')(value, 'en')).toEqualTypeOf<
      string | undefined
    >();
  });

  it('accepts each built-in and a locale-free closure without a wrapper', () => {
    expectTypeOf<Parameters<ChartValueFormat>>().toEqualTypeOf<
      [value: unknown, locale: Locale, calendar: CalendarSystem]
    >();
    expectTypeOf<ReturnType<ChartValueFormat>>().toEqualTypeOf<
      string | null | undefined
    >();
    expectTypeOf(compactNumber).toExtend<ChartValueFormat>();
    expectTypeOf(percent).toExtend<ChartValueFormat>();
    expectTypeOf(shortDate).toExtend<ChartValueFormat>();
    expectTypeOf(monthYear).toExtend<ChartValueFormat>();
    expectTypeOf(currency('$')).toExtend<ChartValueFormat>();
    expectTypeOf((value: unknown) =>
      String(value),
    ).toExtend<ChartValueFormat>();
  });
});

describe('currency() locale precedence', () => {
  it('uses the factory locale when only the factory has one', () => {
    expect(currency('€', 'de-DE')(1234.5)).toBe(
      `€${compactIntl('de-DE', 1234.5)}`,
    );
  });

  it('uses the call-time locale when the factory has none', () => {
    expect(currency('€')(1234.5, 'de-DE')).toBe(
      `€${compactIntl('de-DE', 1234.5)}`,
    );
    expect(currency('€')(12.5, 'de-DE')).toBe(
      `€${new Intl.NumberFormat('de-DE').format(12.5)}`,
    );
  });

  it('keeps the factory locale when both are given', () => {
    expect(currency('€', 'en-US')(1234.5, 'de-DE')).toBe(
      `€${compactIntl('en-US', 1234.5)}`,
    );
    expect(currency('€', 'de-DE')(1234.5, 'en-US')).toBe(
      `€${compactIntl('de-DE', 1234.5)}`,
    );
  });

  it('keeps the one-argument output of a factory locale', () => {
    expect(currency('€', 'de-DE')(1234.5)).toBe(
      currency('€', 'de-DE')(1234.5, 'de-DE'),
    );
    expect(compactIntl('de-DE', 1234.5)).not.toBe(compactIntl('en-US', 1234.5));
  });
});
