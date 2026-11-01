// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, afterEach} from 'vitest';
import {
  type PlainDate,
  plainDateCreate,
  plainDateFromISO,
  plainDateToISO,
  plainDateToDate,
  dateTimeFormatFor,
  plainDateFromDate,
  plainDateToday,
  getDaysInMonth,
  plainDateDayOfWeek,
  plainDateAddMonths,
  plainDateAddDays,
  plainDateDiffDays,
  plainDateToInstant,
  plainDateFromInstant,
  plainDateIsBefore,
  plainDateIsAfter,
  plainDateIsEqual,
  plainDateMax,
  plainDateMin,
  plainDateIsInRange,
  plainDateSetFirstOfMonth,
  plainDateSetStartOfWeek,
  plainDateSetEndOfWeekExclusive,
  plainDateGetWeekNumber,
  plainDateFormat,
  formatSharedDate,
  DATE_FORMAT_LONG,
  DATE_FORMAT_WITH_WEEKDAY,
  DATE_FORMAT_MONTH_YEAR,
  plainDateWeekFieldName,
} from './plainDate';
import type {ISODateString} from './dateTypes';

describe('plainDateCreate', () => {
  it('creates a valid PlainDate', () => {
    expect(plainDateCreate(2026, 1, 25)).toEqual({
      year: 2026,
      month: 1,
      day: 25,
    });
  });

  it('throws for year < 1', () => {
    expect(() => plainDateCreate(0, 1, 1)).toThrow(RangeError);
  });

  it('throws for negative year', () => {
    expect(() => plainDateCreate(-1, 1, 1)).toThrow(RangeError);
  });

  it('throws for non-integer year', () => {
    expect(() => plainDateCreate(2026.5, 1, 1)).toThrow(RangeError);
  });

  it('throws for non-integer month', () => {
    expect(() => plainDateCreate(2026, 1.5, 1)).toThrow(RangeError);
  });

  it('throws for non-integer day', () => {
    expect(() => plainDateCreate(2026, 1, 1.5)).toThrow(RangeError);
  });

  it('throws for month < 1', () => {
    expect(() => plainDateCreate(2026, 0, 1)).toThrow(RangeError);
  });

  it('throws for month > 12', () => {
    expect(() => plainDateCreate(2026, 13, 1)).toThrow(RangeError);
  });

  it('throws for day < 1', () => {
    expect(() => plainDateCreate(2026, 1, 0)).toThrow(RangeError);
  });

  it('throws for day exceeding month length', () => {
    expect(() => plainDateCreate(2026, 2, 29)).toThrow(RangeError);
  });

  it('allows Feb 29 in a leap year', () => {
    expect(plainDateCreate(2024, 2, 29)).toEqual({
      year: 2024,
      month: 2,
      day: 29,
    });
  });

  it('throws for Feb 30 even in a leap year', () => {
    expect(() => plainDateCreate(2024, 2, 30)).toThrow(RangeError);
  });
});

describe('plainDateFromISO', () => {
  it('parses a standard ISO date', () => {
    expect(plainDateFromISO('2026-01-25')).toEqual({
      year: 2026,
      month: 1,
      day: 25,
    });
  });

  it('parses date with 1-based month', () => {
    const dec = plainDateFromISO('2026-12-31');
    expect(dec.month).toBe(12);
  });

  it('handles single-digit month/day when padded', () => {
    expect(plainDateFromISO('2026-03-05')).toEqual({
      year: 2026,
      month: 3,
      day: 5,
    });
  });
});

describe('plainDateToISO', () => {
  it('formats a PlainDate to ISO string', () => {
    expect(plainDateToISO({year: 2026, month: 1, day: 25})).toBe('2026-01-25');
  });

  it('pads single-digit month and day', () => {
    expect(plainDateToISO({year: 2026, month: 3, day: 5})).toBe('2026-03-05');
  });

  it('pads year to 4 digits', () => {
    expect(plainDateToISO({year: 1, month: 1, day: 1})).toBe('0001-01-01');
  });
});

describe('plainDateFromISO / plainDateToISO roundtrip', () => {
  it.each([
    '2026-01-01',
    '2026-06-15',
    '2026-12-31',
    '2000-02-29',
    '1999-11-30',
  ])('roundtrips %s', iso => {
    expect(plainDateToISO(plainDateFromISO(iso as ISODateString))).toBe(iso);
  });
});

describe('plainDateToDate / plainDateFromDate', () => {
  it('converts PlainDate to Date and back', () => {
    const pd: PlainDate = {year: 2026, month: 3, day: 15};
    const d = plainDateToDate(pd);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2); // 0-based
    expect(d.getDate()).toBe(15);
    expect(plainDateFromDate(d)).toEqual(pd);
  });

  it('keeps years 1-99 instead of mapping them to 1900-1999', () => {
    const pd: PlainDate = {year: 1, month: 1, day: 15};
    const d = plainDateToDate(pd);
    expect(d.getFullYear()).toBe(1);
    expect(d.getDay()).toBe(1); // 0001-01-15 is a Monday
    expect(plainDateFromDate(d)).toEqual(pd);
  });
});

describe('plainDateToday', () => {
  it('returns current date with 1-based month', () => {
    const t = plainDateToday();
    const now = new Date();
    expect(t.year).toBe(now.getFullYear());
    expect(t.month).toBe(now.getMonth() + 1);
    expect(t.day).toBe(now.getDate());
  });
});

describe('getDaysInMonth', () => {
  it('returns 31 for January', () => {
    expect(getDaysInMonth(2026, 1)).toBe(31);
  });

  it('returns 28 for February in a non-leap year', () => {
    expect(getDaysInMonth(2026, 2)).toBe(28);
  });

  it('returns 29 for February in a leap year', () => {
    expect(getDaysInMonth(2024, 2)).toBe(29);
  });

  it('returns 30 for April', () => {
    expect(getDaysInMonth(2026, 4)).toBe(30);
  });

  it('handles century non-leap year', () => {
    expect(getDaysInMonth(1900, 2)).toBe(28);
  });

  it('handles 400-year leap year', () => {
    expect(getDaysInMonth(2000, 2)).toBe(29);
  });
});

describe('plainDateDayOfWeek', () => {
  it('returns 0 for a known Sunday', () => {
    // 2026-01-04 is a Sunday
    expect(plainDateDayOfWeek({year: 2026, month: 1, day: 4})).toBe(0);
  });

  it('returns 1 for a known Monday', () => {
    // 2026-01-05 is a Monday
    expect(plainDateDayOfWeek({year: 2026, month: 1, day: 5})).toBe(1);
  });

  it('returns 6 for a known Saturday', () => {
    // 2026-01-03 is a Saturday
    expect(plainDateDayOfWeek({year: 2026, month: 1, day: 3})).toBe(6);
  });
});

describe('plainDateAddMonths', () => {
  it('adds months within the same year', () => {
    expect(plainDateAddMonths({year: 2026, month: 1, day: 15}, 3)).toEqual({
      year: 2026,
      month: 4,
      day: 15,
    });
  });

  it('rolls over to the next year', () => {
    expect(plainDateAddMonths({year: 2026, month: 11, day: 15}, 3)).toEqual({
      year: 2027,
      month: 2,
      day: 15,
    });
  });

  it('subtracts months', () => {
    expect(plainDateAddMonths({year: 2026, month: 3, day: 15}, -2)).toEqual({
      year: 2026,
      month: 1,
      day: 15,
    });
  });

  it('rolls back to previous year', () => {
    expect(plainDateAddMonths({year: 2026, month: 1, day: 15}, -2)).toEqual({
      year: 2025,
      month: 11,
      day: 15,
    });
  });

  it('clamps to the last day when the target month is shorter', () => {
    // Jan 31 + 1 month lands in February (clamped), not overflowed into
    // March — matching Temporal.PlainDate.add and date-fns addMonths.
    expect(plainDateAddMonths({year: 2026, month: 1, day: 31}, 1)).toEqual({
      year: 2026,
      month: 2,
      day: 28,
    });
  });

  it('clamps to Feb 29 in a leap year', () => {
    expect(plainDateAddMonths({year: 2024, month: 1, day: 31}, 1)).toEqual({
      year: 2024,
      month: 2,
      day: 29,
    });
  });

  it('clamps when subtracting into a shorter month', () => {
    expect(plainDateAddMonths({year: 2026, month: 3, day: 31}, -1)).toEqual({
      year: 2026,
      month: 2,
      day: 28,
    });
  });

  it('clamps a 31st onto a 30-day month', () => {
    expect(plainDateAddMonths({year: 2026, month: 5, day: 31}, 1)).toEqual({
      year: 2026,
      month: 6,
      day: 30,
    });
  });
});

describe('plainDateAddDays', () => {
  it('adds days within the same month', () => {
    expect(plainDateAddDays({year: 2026, month: 1, day: 15}, 5)).toEqual({
      year: 2026,
      month: 1,
      day: 20,
    });
  });

  it('rolls over to next month', () => {
    expect(plainDateAddDays({year: 2026, month: 1, day: 30}, 3)).toEqual({
      year: 2026,
      month: 2,
      day: 2,
    });
  });

  it('rolls over to next year', () => {
    expect(plainDateAddDays({year: 2026, month: 12, day: 30}, 3)).toEqual({
      year: 2027,
      month: 1,
      day: 2,
    });
  });

  it('subtracts days', () => {
    expect(plainDateAddDays({year: 2026, month: 1, day: 15}, -5)).toEqual({
      year: 2026,
      month: 1,
      day: 10,
    });
  });

  it('rolls back to previous month', () => {
    expect(plainDateAddDays({year: 2026, month: 2, day: 1}, -1)).toEqual({
      year: 2026,
      month: 1,
      day: 31,
    });
  });
});

describe('plainDateDiffDays', () => {
  it('counts whole days forward', () => {
    expect(
      plainDateDiffDays(
        {year: 2026, month: 1, day: 10},
        {year: 2026, month: 1, day: 17},
      ),
    ).toBe(7);
  });

  it('is negative when the second date is earlier', () => {
    expect(
      plainDateDiffDays(
        {year: 2026, month: 1, day: 10},
        {year: 2026, month: 1, day: 3},
      ),
    ).toBe(-7);
  });

  it('is zero for the same day', () => {
    expect(
      plainDateDiffDays(
        {year: 2026, month: 6, day: 15},
        {year: 2026, month: 6, day: 15},
      ),
    ).toBe(0);
  });

  it('counts across month and year boundaries', () => {
    expect(
      plainDateDiffDays(
        {year: 2025, month: 12, day: 30},
        {year: 2026, month: 1, day: 2},
      ),
    ).toBe(3);
  });

  it('ignores DST — every calendar day counts once across a spring-forward', () => {
    // US DST 2026 begins Mar 8. The gap Mar 7 → Mar 9 is two calendar days
    // even though one of them is 23 hours long.
    expect(
      plainDateDiffDays(
        {year: 2026, month: 3, day: 7},
        {year: 2026, month: 3, day: 9},
      ),
    ).toBe(2);
  });

  it('counts across the year 99 to 100 boundary', () => {
    expect(
      plainDateDiffDays(
        {year: 99, month: 12, day: 31},
        {year: 100, month: 1, day: 1},
      ),
    ).toBe(1);
  });
});

describe('plainDateToInstant / plainDateFromInstant', () => {
  it('converts a PlainDate to midnight in the requested timezone', () => {
    expect(
      plainDateToInstant(
        {year: 2026, month: 5, day: 13},
        'America/Los_Angeles',
      ),
    ).toBe(Date.UTC(2026, 4, 13, 7));
  });

  it('roundtrips a PlainDate in the requested timezone', () => {
    const date: PlainDate = {year: 2026, month: 5, day: 13};
    expect(
      plainDateFromInstant(
        plainDateToInstant(date, 'America/Los_Angeles'),
        'America/Los_Angeles',
      ),
    ).toEqual(date);
  });

  it('supports explicit time components', () => {
    expect(
      plainDateToInstant(
        {year: 2026, month: 5, day: 13},
        'America/Los_Angeles',
        9,
        30,
      ),
    ).toBe(Date.UTC(2026, 4, 13, 16, 30));
  });

  it.each([
    // Both spring forward from a negative offset at local midnight.
    [
      'America/Santiago',
      {year: 2026, month: 9, day: 6},
      Date.UTC(2026, 8, 6, 4),
    ],
    ['America/Havana', {year: 2026, month: 3, day: 8}, Date.UTC(2026, 2, 8, 5)],
    // A positive offset already resolved forward; it must not move.
    ['Asia/Beirut', {year: 2026, month: 3, day: 29}, Date.UTC(2026, 2, 28, 22)],
  ] as const)(
    'starts a day whose midnight daylight saving skips at its first instant (%s)',
    (timezoneID, date, firstInstant) => {
      const instant = plainDateToInstant(date, timezoneID);
      expect(instant).toBe(firstInstant);
      expect(plainDateFromInstant(instant, timezoneID)).toEqual(date);
      expect(plainDateFromInstant(instant - 1, timezoneID)).not.toEqual(date);
    },
  );

  it('resolves any wall time inside a daylight-saving gap forward', () => {
    // 2:30 AM does not happen on March 8, 2026 in Los Angeles: 3:30 AM PDT.
    expect(
      plainDateToInstant(
        {year: 2026, month: 3, day: 8},
        'America/Los_Angeles',
        2,
        30,
      ),
    ).toBe(Date.UTC(2026, 2, 8, 10, 30));
  });

  it('keeps the earlier instant of a wall time that happens twice', () => {
    // Havana falls back at 1:00 AM on November 1, 2026: midnight once, then
    // 12:00–1:00 AM twice; the first 12:30 AM is still daylight time.
    expect(
      plainDateToInstant(
        {year: 2026, month: 11, day: 1},
        'America/Havana',
        0,
        30,
      ),
    ).toBe(Date.UTC(2026, 10, 1, 4, 30));
  });

  it.each([
    // Berlin falls back at 3:00 AM CEST on October 25, 2026: 2:00–3:00 AM
    // happens twice, first at +2, then at +1.
    [
      'Europe/Berlin',
      {year: 2026, month: 10, day: 25},
      2,
      30,
      Date.UTC(2026, 9, 25, 0, 30),
    ],
    // Sydney falls back at 3:00 AM AEDT on April 5, 2026: first at +11.
    [
      'Australia/Sydney',
      {year: 2026, month: 4, day: 5},
      2,
      30,
      Date.UTC(2026, 3, 4, 15, 30),
    ],
  ] as const)(
    'keeps the earlier instant of a repeated wall time in a positive-offset zone (%s)',
    (timezoneID, date, hour, minute, earlier) => {
      expect(plainDateToInstant(date, timezoneID, hour, minute)).toBe(earlier);
    },
  );

  it('starts a date the zone skips at the first instant after the gap', () => {
    // Samoa moved across the date line after December 29, 2011: December 30
    // never happened in Pacific/Apia, so it resolves to 00:00 on December 31
    // (+14), the next date.
    const instant = plainDateToInstant(
      {year: 2011, month: 12, day: 30},
      'Pacific/Apia',
    );
    expect(instant).toBe(Date.UTC(2011, 11, 30, 10));
    expect(plainDateFromInstant(instant, 'Pacific/Apia')).toEqual({
      year: 2011,
      month: 12,
      day: 31,
    });
  });

  it('moves a wall time in a 30-minute gap forward by 30 minutes', () => {
    // Lord Howe Island jumps from 2:00 to 2:30 AM on October 4, 2026, from
    // +10:30 to +11: 2:15 AM does not happen and reads as 2:45 AM.
    expect(
      plainDateToInstant(
        {year: 2026, month: 10, day: 4},
        'Australia/Lord_Howe',
        2,
        15,
      ),
    ).toBe(Date.UTC(2026, 9, 3, 15, 45));
  });

  it('keeps years 1-99 instead of mapping them to 1900-1999', () => {
    const date: PlainDate = {year: 1, month: 1, day: 15};
    // 0001-01-01T00:00:00Z is -62135596800000
    expect(plainDateToInstant(date, 'UTC', 9, 30)).toBe(
      -62135596800000 + (14 * 24 + 9) * 3600000 + 30 * 60000,
    );
    expect(
      plainDateFromInstant(
        plainDateToInstant(date, 'America/Los_Angeles'),
        'America/Los_Angeles',
      ),
    ).toEqual(date);
  });
});

describe('plainDateIsBefore / plainDateIsAfter', () => {
  it('returns false for equal dates (isBefore)', () => {
    expect(
      plainDateIsBefore(
        {year: 2026, month: 1, day: 15},
        {year: 2026, month: 1, day: 15},
      ),
    ).toBe(false);
  });

  it('returns false for equal dates (isAfter)', () => {
    expect(
      plainDateIsAfter(
        {year: 2026, month: 1, day: 15},
        {year: 2026, month: 1, day: 15},
      ),
    ).toBe(false);
  });

  it('returns true when first is earlier (isBefore)', () => {
    expect(
      plainDateIsBefore(
        {year: 2026, month: 1, day: 14},
        {year: 2026, month: 1, day: 15},
      ),
    ).toBe(true);
  });

  it('returns true when first is later (isAfter)', () => {
    expect(
      plainDateIsAfter(
        {year: 2026, month: 1, day: 16},
        {year: 2026, month: 1, day: 15},
      ),
    ).toBe(true);
  });

  it('compares by year first', () => {
    expect(
      plainDateIsBefore(
        {year: 2025, month: 12, day: 31},
        {year: 2026, month: 1, day: 1},
      ),
    ).toBe(true);
  });

  it('compares by month when years equal', () => {
    expect(
      plainDateIsBefore(
        {year: 2026, month: 1, day: 31},
        {year: 2026, month: 2, day: 1},
      ),
    ).toBe(true);
  });
});

describe('plainDateIsEqual', () => {
  it('returns true for same date', () => {
    expect(
      plainDateIsEqual(
        {year: 2026, month: 1, day: 15},
        {year: 2026, month: 1, day: 15},
      ),
    ).toBe(true);
  });

  it('returns false for different day', () => {
    expect(
      plainDateIsEqual(
        {year: 2026, month: 1, day: 15},
        {year: 2026, month: 1, day: 16},
      ),
    ).toBe(false);
  });

  it('returns false for different month', () => {
    expect(
      plainDateIsEqual(
        {year: 2026, month: 1, day: 15},
        {year: 2026, month: 2, day: 15},
      ),
    ).toBe(false);
  });
});

describe('plainDateMax / plainDateMin', () => {
  const earlier: PlainDate = {year: 2026, month: 1, day: 14};
  const later: PlainDate = {year: 2026, month: 1, day: 15};

  it('returns the later date for max', () => {
    expect(plainDateMax(earlier, later)).toBe(later);
    expect(plainDateMax(later, earlier)).toBe(later);
  });

  it('returns the earlier date for min', () => {
    expect(plainDateMin(earlier, later)).toBe(earlier);
    expect(plainDateMin(later, earlier)).toBe(earlier);
  });

  it('returns the first date when dates are equal', () => {
    const equal: PlainDate = {year: 2026, month: 1, day: 15};
    expect(plainDateMax(later, equal)).toBe(later);
    expect(plainDateMin(later, equal)).toBe(later);
  });
});

describe('plainDateIsInRange', () => {
  const start: PlainDate = {year: 2026, month: 1, day: 10};
  const end: PlainDate = {year: 2026, month: 1, day: 20};

  it('returns true for date within range', () => {
    expect(
      plainDateIsInRange({year: 2026, month: 1, day: 15}, [start, end]),
    ).toBe(true);
  });

  it('returns true for start boundary', () => {
    expect(plainDateIsInRange(start, [start, end])).toBe(true);
  });

  it('returns true for end boundary', () => {
    expect(plainDateIsInRange(end, [start, end])).toBe(true);
  });

  it('returns false for date before range', () => {
    expect(
      plainDateIsInRange({year: 2026, month: 1, day: 9}, [start, end]),
    ).toBe(false);
  });

  it('returns false for date after range', () => {
    expect(
      plainDateIsInRange({year: 2026, month: 1, day: 21}, [start, end]),
    ).toBe(false);
  });
});

describe('plainDateSetStartOfWeek / plainDateSetEndOfWeekExclusive', () => {
  it('returns the start of the week for a Sunday-start week', () => {
    expect(plainDateSetStartOfWeek({year: 2026, month: 5, day: 13}, 0)).toEqual(
      {year: 2026, month: 5, day: 10},
    );
  });

  it('returns the start of the week for a Monday-start week', () => {
    expect(plainDateSetStartOfWeek({year: 2026, month: 5, day: 13}, 1)).toEqual(
      {year: 2026, month: 5, day: 11},
    );
  });

  it('returns the exclusive end of the week', () => {
    expect(
      plainDateSetEndOfWeekExclusive({year: 2026, month: 5, day: 13}, 0),
    ).toEqual({year: 2026, month: 5, day: 17});
  });
});

describe('plainDateSetFirstOfMonth', () => {
  it('returns first day of the same month', () => {
    expect(plainDateSetFirstOfMonth({year: 2026, month: 3, day: 15})).toEqual({
      year: 2026,
      month: 3,
      day: 1,
    });
  });

  it('is a no-op for day 1', () => {
    const pd = {year: 2026, month: 3, day: 1};
    expect(plainDateSetFirstOfMonth(pd)).toEqual(pd);
  });
});

describe('plainDateGetWeekNumber', () => {
  it('returns week 1 for Jan 1 2026 (Thursday)', () => {
    expect(plainDateGetWeekNumber({year: 2026, month: 1, day: 1})).toBe(1);
  });

  it('returns week 53 for Dec 31 2020 (Thursday in ISO week 53)', () => {
    expect(plainDateGetWeekNumber({year: 2020, month: 12, day: 31})).toBe(53);
  });

  it('returns week 1 for Jan 4 (always in ISO week 1)', () => {
    expect(plainDateGetWeekNumber({year: 2026, month: 1, day: 4})).toBe(1);
  });

  // Regression: the week number must not depend on the host timezone's DST
  // offset. Zones whose DST ends after New Year (southern hemisphere) used to
  // add a phantom hour to the Thursday-vs-Jan-1 day count, and in years whose
  // Jan 1 is a Friday that hour rounded a whole week up.
  describe('DST independence', () => {
    const originalTZ = process.env.TZ;

    afterEach(() => {
      if (originalTZ === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTZ;
      }
    });

    it.each(['Australia/Sydney', 'Pacific/Auckland', 'America/Santiago'])(
      'does not round week 14 up to 15 in %s (DST ends after New Year)',
      zone => {
        process.env.TZ = zone;
        // 2021-01-01 is a Friday, so every ISO Thursday falls on a whole
        // multiple of 7 days into the year. 2021-04-05..11 is ISO week 14.
        expect(plainDateGetWeekNumber({year: 2021, month: 4, day: 5})).toBe(14);
        expect(plainDateGetWeekNumber({year: 2021, month: 4, day: 8})).toBe(14);
        expect(plainDateGetWeekNumber({year: 2021, month: 4, day: 11})).toBe(
          14,
        );
      },
    );

    it('keeps late-December weeks correct in Australia/Sydney', () => {
      process.env.TZ = 'Australia/Sydney';
      // 2027-12-30 (Thursday) is ISO week 52, not 53.
      expect(plainDateGetWeekNumber({year: 2027, month: 12, day: 30})).toBe(52);
    });
  });

  it('keeps years 1-99 instead of mapping them to 1900-1999', () => {
    // 0004-01-01 is a Thursday (ISO week 1); 1904-01-01 was a Friday.
    expect(plainDateGetWeekNumber({year: 4, month: 1, day: 1})).toBe(1);
  });
});

describe('plainDateFormat', () => {
  it('keeps one formatter per locale and options, whatever order the options are in', () => {
    // A month of day labels, as a calendar renders them, reuses one formatter.
    const first = dateTimeFormatFor('en-NZ', DATE_FORMAT_WITH_WEEKDAY);
    expect(dateTimeFormatFor('en-NZ', DATE_FORMAT_WITH_WEEKDAY)).toBe(first);
    expect(
      dateTimeFormatFor('en-NZ', {
        year: 'numeric',
        day: 'numeric',
        month: 'long',
        weekday: 'long',
      }),
    ).toBe(first);
    // Other options, or another locale, get their own.
    expect(dateTimeFormatFor('en-NZ', DATE_FORMAT_MONTH_YEAR)).not.toBe(first);
    expect(dateTimeFormatFor('en-ZA', DATE_FORMAT_WITH_WEEKDAY)).not.toBe(
      first,
    );
  });

  it('formats the same date after the host zone moves', () => {
    // The page stays open while the device travels east: a formatter cached
    // in the first zone must not move the date.
    const zone = process.env.TZ;
    try {
      process.env.TZ = 'America/Los_Angeles';
      expect(
        plainDateFormat(
          {year: 2026, month: 2, day: 1},
          DATE_FORMAT_MONTH_YEAR,
          'en-IE',
        ),
      ).toBe('February 2026');
      process.env.TZ = 'America/New_York';
      expect(
        plainDateFormat(
          {year: 2026, month: 2, day: 1},
          DATE_FORMAT_MONTH_YEAR,
          'en-IE',
        ),
      ).toBe('February 2026');
      process.env.TZ = 'Pacific/Kiritimati';
      expect(
        plainDateFormat(
          {year: 2026, month: 2, day: 1},
          DATE_FORMAT_WITH_WEEKDAY,
          'en-IE',
        ),
      ).toBe('Sunday 1 February 2026');
    } finally {
      if (zone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = zone;
      }
    }
  });

  it('prints a zone name or a time of day in the host zone, as before', () => {
    // A PlainDate has neither: such fields read local midnight in the zone
    // current at the call, not the UTC the date-only path formats in.
    const zone = process.env.TZ;
    try {
      process.env.TZ = 'America/Los_Angeles';
      const withZone = plainDateFormat(
        {year: 2026, month: 1, day: 25},
        {...DATE_FORMAT_LONG, timeZoneName: 'short'},
        'en-US',
      );
      expect(withZone).toContain('January 25, 2026');
      expect(withZone).toContain('PST');
      expect(withZone).not.toContain('UTC');
      process.env.TZ = 'America/New_York';
      expect(
        plainDateFormat(
          {year: 2026, month: 1, day: 25},
          {...DATE_FORMAT_LONG, timeZoneName: 'short'},
          'en-US',
        ),
      ).toContain('EST');
    } finally {
      if (zone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = zone;
      }
    }
  });

  it('returns a human-readable date string with weekday', () => {
    const result = plainDateFormat(
      {year: 2026, month: 1, day: 25},
      DATE_FORMAT_WITH_WEEKDAY,
    );
    expect(result).toContain('2026');
    expect(result).toContain('25');
  });

  it('defaults to en when the locale is omitted', () => {
    expect(
      plainDateFormat({year: 2026, month: 8, day: 22}, DATE_FORMAT_MONTH_YEAR),
    ).toBe('August 2026');
  });

  it('honors an explicit locale', () => {
    expect(
      plainDateFormat(
        {year: 2026, month: 8, day: 22},
        DATE_FORMAT_MONTH_YEAR,
        'fr',
      ),
    ).toBe('août 2026');
  });

  it('matches an explicit en locale when the locale is omitted', () => {
    const pd: PlainDate = {year: 2026, month: 8, day: 22};
    for (const options of [DATE_FORMAT_MONTH_YEAR, DATE_FORMAT_WITH_WEEKDAY]) {
      expect(plainDateFormat(pd, options)).toBe(
        plainDateFormat(pd, options, 'en'),
      );
    }
  });

  it('uses Gregorian fields for a non-Gregorian locale extension', () => {
    expect(
      plainDateFormat(
        {year: 2026, month: 8, day: 22},
        {year: 'numeric'},
        'en-US-u-ca-buddhist',
      ),
    ).toBe('2026');
  });

  it('honors an explicitly requested calendar for compatibility', () => {
    expect(
      plainDateFormat(
        {year: 2026, month: 8, day: 22},
        {year: 'numeric', calendar: 'buddhist'},
        'en-US',
      ),
    ).toBe('2569 BE');
  });
});

describe('formatSharedDate', () => {
  const pd: PlainDate = {year: 2026, month: 1, day: 25};

  it('formats the short-month "date" shape', () => {
    expect(formatSharedDate(pd, 'date')).toBe('Jan 25, 2026');
  });

  it('formats the long-month "date_long" shape', () => {
    expect(formatSharedDate(pd, 'date_long')).toBe('January 25, 2026');
  });

  it('formats the weekday "date_weekday" shape', () => {
    // 2026-01-25 is a Sunday.
    expect(formatSharedDate(pd, 'date_weekday')).toBe('Sun, Jan 25, 2026');
  });

  it('formats the ISO "system_date" shape', () => {
    expect(formatSharedDate(pd, 'system_date')).toBe('2026-01-25');
  });

  it('follows the passed locale rather than the host locale (#5074)', () => {
    expect(formatSharedDate(pd, 'date_long', 'es-ES')).toBe(
      '25 de enero de 2026',
    );
  });
});

describe('plainDateWeekFieldName', () => {
  it("returns the locale's CLDR name for the week field", () => {
    expect(plainDateWeekFieldName('en-US')).toBe('week');
    expect(plainDateWeekFieldName('de-DE')).toBe('Woche');
  });

  it('never returns an empty name', () => {
    expect(plainDateWeekFieldName('zxx').length).toBeGreaterThan(0);
  });
});
