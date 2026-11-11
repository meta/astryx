// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file dateParser.test.ts
 * @input Uses vitest, dateParser utilities
 * @output Unit tests for date parsing utilities
 * @position Testing; validates dateParser.ts implementation
 *
 * SYNC: When dateParser.ts changes, update tests to match new behavior
 */

import {describe, it, expect, vi} from 'vitest';
import {isLocaleDayFirst, parseDateInput} from './dateParser';

describe('parseDateInput', () => {
  describe('ISO format (YYYY-MM-DD)', () => {
    it('parses valid ISO date', () => {
      expect(parseDateInput('2026-01-25')).toEqual({
        year: 2026,
        month: 1,
        day: 25,
      });
    });

    it('parses ISO date with single-digit month/day', () => {
      expect(parseDateInput('2026-1-5')).toEqual({
        year: 2026,
        month: 1,
        day: 5,
      });
    });

    it('returns null for invalid ISO date', () => {
      expect(parseDateInput('2026-13-25')).toBeNull();
      expect(parseDateInput('2026-02-30')).toBeNull();
    });
  });

  describe('full month name formats', () => {
    it('parses "January 25, 2026"', () => {
      expect(parseDateInput('January 25, 2026')).toEqual({
        year: 2026,
        month: 1,
        day: 25,
      });
    });

    it('parses "Jan 25, 2026"', () => {
      expect(parseDateInput('Jan 25, 2026')).toEqual({
        year: 2026,
        month: 1,
        day: 25,
      });
    });

    it('parses "25 January 2026"', () => {
      expect(parseDateInput('25 January 2026')).toEqual({
        year: 2026,
        month: 1,
        day: 25,
      });
    });

    it('parses "25 Jan 2026"', () => {
      expect(parseDateInput('25 Jan 2026')).toEqual({
        year: 2026,
        month: 1,
        day: 25,
      });
    });

    it('parses without comma', () => {
      expect(parseDateInput('January 25 2026')).toEqual({
        year: 2026,
        month: 1,
        day: 25,
      });
    });

    it('handles case insensitive month names', () => {
      expect(parseDateInput('JANUARY 25, 2026')).toEqual({
        year: 2026,
        month: 1,
        day: 25,
      });
      expect(parseDateInput('january 25, 2026')).toEqual({
        year: 2026,
        month: 1,
        day: 25,
      });
    });

    it('parses all month names', () => {
      expect(parseDateInput('February 1, 2026')).toEqual({
        year: 2026,
        month: 2,
        day: 1,
      });
      expect(parseDateInput('March 1, 2026')).toEqual({
        year: 2026,
        month: 3,
        day: 1,
      });
      expect(parseDateInput('April 1, 2026')).toEqual({
        year: 2026,
        month: 4,
        day: 1,
      });
      expect(parseDateInput('May 1, 2026')).toEqual({
        year: 2026,
        month: 5,
        day: 1,
      });
      expect(parseDateInput('June 1, 2026')).toEqual({
        year: 2026,
        month: 6,
        day: 1,
      });
      expect(parseDateInput('July 1, 2026')).toEqual({
        year: 2026,
        month: 7,
        day: 1,
      });
      expect(parseDateInput('August 1, 2026')).toEqual({
        year: 2026,
        month: 8,
        day: 1,
      });
      expect(parseDateInput('September 1, 2026')).toEqual({
        year: 2026,
        month: 9,
        day: 1,
      });
      expect(parseDateInput('October 1, 2026')).toEqual({
        year: 2026,
        month: 10,
        day: 1,
      });
      expect(parseDateInput('November 1, 2026')).toEqual({
        year: 2026,
        month: 11,
        day: 1,
      });
      expect(parseDateInput('December 1, 2026')).toEqual({
        year: 2026,
        month: 12,
        day: 1,
      });
    });

    it('parses abbreviated month names', () => {
      expect(parseDateInput('Feb 1, 2026')).toEqual({
        year: 2026,
        month: 2,
        day: 1,
      });
      expect(parseDateInput('Sep 1, 2026')).toEqual({
        year: 2026,
        month: 9,
        day: 1,
      });
      expect(parseDateInput('Sept 1, 2026')).toEqual({
        year: 2026,
        month: 9,
        day: 1,
      });
    });
  });

  describe('formats without year (defaults to current year)', () => {
    const currentYear = new Date().getFullYear();

    it('parses "January 25" (month-first without year)', () => {
      expect(parseDateInput('January 25')).toEqual({
        year: currentYear,
        month: 1,
        day: 25,
      });
    });

    it('parses "Jan 25" (abbreviated month without year)', () => {
      expect(parseDateInput('Jan 25')).toEqual({
        year: currentYear,
        month: 1,
        day: 25,
      });
    });

    it('parses "25 January" (day-first without year)', () => {
      expect(parseDateInput('25 January')).toEqual({
        year: currentYear,
        month: 1,
        day: 25,
      });
    });

    it('parses "25 Jan" (day-first abbreviated without year)', () => {
      expect(parseDateInput('25 Jan')).toEqual({
        year: currentYear,
        month: 1,
        day: 25,
      });
    });

    it('parses "1/25" (numeric without year)', () => {
      expect(parseDateInput('1/25')).toEqual({
        year: currentYear,
        month: 1,
        day: 25,
      });
    });

    it('parses "25/1" (numeric day-first without year)', () => {
      expect(parseDateInput('25/1')).toEqual({
        year: currentYear,
        month: 1,
        day: 25,
      });
    });

    it('parses "12-31" (numeric with dash without year)', () => {
      expect(parseDateInput('12-31')).toEqual({
        year: currentYear,
        month: 12,
        day: 31,
      });
    });

    it('handles all months without year', () => {
      expect(parseDateInput('Feb 15')).toEqual({
        year: currentYear,
        month: 2,
        day: 15,
      });
      expect(parseDateInput('Dec 25')).toEqual({
        year: currentYear,
        month: 12,
        day: 25,
      });
    });
  });

  describe('numeric formats with heuristics', () => {
    it('detects day when first number > 12', () => {
      expect(parseDateInput('25/1/2026')).toEqual({
        year: 2026,
        month: 1,
        day: 25,
      });
      expect(parseDateInput('31-12-2026')).toEqual({
        year: 2026,
        month: 12,
        day: 31,
      });
    });

    it('detects day when second number > 12', () => {
      expect(parseDateInput('1/25/2026')).toEqual({
        year: 2026,
        month: 1,
        day: 25,
      });
      expect(parseDateInput('12-31-2026')).toEqual({
        year: 2026,
        month: 12,
        day: 31,
      });
    });

    it('returns null when both numbers > 12', () => {
      expect(parseDateInput('25/31/2026')).toBeNull();
    });

    it('validates day/month ranges', () => {
      expect(parseDateInput('0/15/2026')).toBeNull();
      expect(parseDateInput('15/0/2026')).toBeNull();
    });
  });

  describe('ambiguous numeric formats follow the passed locale (#5074)', () => {
    // Both numbers are <= 12, so the day/month order is genuinely ambiguous
    // and resolved by isLocaleDayFirst(locale) rather than the host locale.
    it('defaults ambiguous input to English month-first order', () => {
      expect(parseDateInput('3/4/2026')).toEqual({
        year: 2026,
        month: 3,
        day: 4,
      });
    });

    it('reads month-first for en-US', () => {
      expect(parseDateInput('3/4/2026', 'en-US')).toEqual({
        year: 2026,
        month: 3,
        day: 4,
      });
    });

    it('reads day-first for es-ES', () => {
      expect(parseDateInput('3/4/2026', 'es-ES')).toEqual({
        year: 2026,
        month: 4,
        day: 3,
      });
    });
  });

  describe('isLocaleDayFirst', () => {
    it('defaults to English month-first order', () => {
      expect(isLocaleDayFirst()).toBe(false);
    });

    it('requests Gregorian calendar data for locale ordering', () => {
      const OriginalDateTimeFormat = globalThis.Intl.DateTimeFormat;
      const dateTimeFormatSpy = vi
        .spyOn(globalThis.Intl, 'DateTimeFormat')
        .mockImplementation(function DateTimeFormat(locale, options) {
          return new OriginalDateTimeFormat(locale, options);
        });

      try {
        isLocaleDayFirst('en-US-u-ca-buddhist');
        expect(dateTimeFormatSpy).toHaveBeenCalledWith('en-US-u-ca-buddhist', {
          calendar: 'gregory',
        });
      } finally {
        dateTimeFormatSpy.mockRestore();
      }
    });
  });

  describe('edge cases', () => {
    it('returns null for empty string', () => {
      expect(parseDateInput('')).toBeNull();
    });

    it('returns null for whitespace only', () => {
      expect(parseDateInput('   ')).toBeNull();
    });

    it('trims whitespace', () => {
      expect(parseDateInput('  2026-01-25  ')).toEqual({
        year: 2026,
        month: 1,
        day: 25,
      });
    });

    it('returns null for completely invalid strings', () => {
      expect(parseDateInput('not a date')).toBeNull();
      expect(parseDateInput('abc xyz')).toBeNull();
    });

    it('validates February dates', () => {
      expect(parseDateInput('February 29, 2024')).toEqual({
        year: 2024,
        month: 2,
        day: 29,
      }); // Leap year
      expect(parseDateInput('February 29, 2025')).toBeNull(); // Not a leap year
      expect(parseDateInput('February 30, 2024')).toBeNull();
    });

    it('preserves years 0-99 literally instead of mapping to 1900s', () => {
      expect(parseDateInput('01/01/0050')).toEqual({
        year: 50,
        month: 1,
        day: 1,
      });
    });

    it('rejects mixed separators', () => {
      expect(parseDateInput('1/25.2026')).toBeNull();
    });

    it('in a day-first locale, never reads numeric text month-first outside the locale-ordered forms', () => {
      // Native Date reads these month-first whatever the locale.
      for (const text of [
        '12/0',
        '12/01/',
        '12/01/2',
        '12/01/20',
        '12/01/202',
        '12/01/90',
        '12,01',
        '12,01,2026',
        '12;01;2026',
      ]) {
        expect(parseDateInput(text, 'en-GB')).toBeNull();
      }
      // A month-first locale keeps the browser's reading of a short year.
      expect(parseDateInput('1/5/25', 'en-US')).toEqual({
        year: 2025,
        month: 1,
        day: 5,
      });
      // A four-digit year written first parses in every locale, with any
      // separator the browser reads.
      for (const locale of ['en-GB', 'en-US']) {
        for (const text of ['2026/01/12', '2026 01 12', '2026.1.12.']) {
          expect(parseDateInput(text, locale)).toEqual({
            year: 2026,
            month: 1,
            day: 12,
          });
        }
      }
      // The locale-ordered forms still parse in the locale's order.
      expect(parseDateInput('12/01/2026', 'en-GB')).toEqual({
        year: 2026,
        month: 1,
        day: 12,
      });
      expect(parseDateInput('12/01', 'en-GB')).toMatchObject({
        month: 1,
        day: 12,
      });
    });

    it('treats a single typed digit as incomplete, not a date', () => {
      // A user starting to type a month (e.g. "0" or "1" for January) should
      // not produce a date. Native Date parsing would otherwise coerce these
      // into arbitrary dates (and a year of 0 in some engines).
      expect(parseDateInput('0')).toBeNull();
      expect(parseDateInput('1')).toBeNull();
    });

    it('treats bare numeric input as incomplete, not a date', () => {
      expect(parseDateInput('00')).toBeNull();
      expect(parseDateInput('01')).toBeNull();
      expect(parseDateInput('12')).toBeNull();
      expect(parseDateInput('2026')).toBeNull();
    });

    it('never returns an out-of-range date for partial input', () => {
      // Regression: partial input must never yield a date with year < 1,
      // which would throw when later re-parsed and crash the page.
      for (const input of ['0', '1', '01', '00', '9', '99']) {
        const result = parseDateInput(input);
        if (result !== null) {
          expect(result.year).toBeGreaterThanOrEqual(1);
        }
      }
    });
  });
});
