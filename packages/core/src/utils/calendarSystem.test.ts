// Copyright (c) Meta Platforms, Inc. and affiliates.

import 'temporal-polyfill/full/global';
import {describe, expect, it} from 'vitest';
import {
  CALENDAR_SYSTEMS,
  type CalendarMonth,
  type CalendarSystem,
  calendarAddMonths,
  calendarDateFromFields,
  calendarDayOfMonth,
  calendarMonthOf,
  calendarMonthsInYear,
  calendarShiftMonths,
  calendarShiftYears,
  formatCalendarDate,
  formatCalendarMonthLabel,
  formatDayNumber,
  isCalendarSystemAvailable,
  isGregorianAligned,
  isInCalendarMonth,
} from './calendarSystem';
import {
  DATE_FORMAT_WITH_WEEKDAY,
  type PlainDate,
  plainDateAddDays,
  plainDateFromISO,
  plainDateIsAfter,
  plainDateToISO,
} from './plainDate';
import type {ISODateString} from './dateTypes';

const iso = plainDateFromISO;

interface OracleDate {
  readonly month: number;
  readonly monthsInYear: number;
}

// The polyfill loaded above is the independent oracle for month positions.
function oracle(calendar: CalendarSystem, pd: PlainDate): OracleDate {
  const temporal = (
    globalThis as unknown as {
      Temporal: {
        PlainDate: new (
          y: number,
          m: number,
          d: number,
          c: string,
        ) => OracleDate;
      };
    }
  ).Temporal;
  return new temporal.PlainDate(pd.year, pd.month, pd.day, calendar);
}

function monthAt(calendar: CalendarSystem, date: ISODateString) {
  const month = calendarMonthOf(calendar, iso(date));
  return {
    start: plainDateToISO(month.start),
    end: plainDateToISO(month.end),
    length: month.length,
  };
}

describe('calendar month structure at known dates', () => {
  it('Persian Aban 1405 runs from 2026-10-23 to 2026-11-21', () => {
    expect(monthAt('persian', '2026-10-30')).toEqual({
      start: '2026-10-23',
      end: '2026-11-21',
      length: 30,
    });
    expect(calendarDayOfMonth('persian', iso('2026-10-30'))).toBe(8);
  });

  it('Hebrew leap year 5784 has Adar I of 30 days and Adar II of 29 days', () => {
    expect(monthAt('hebrew', '2024-02-20')).toEqual({
      start: '2024-02-10',
      end: '2024-03-10',
      length: 30,
    });
    expect(monthAt('hebrew', '2024-03-20')).toEqual({
      start: '2024-03-11',
      end: '2024-04-08',
      length: 29,
    });
  });

  it('Ethiopic Pagume 2018 has 5 days from 2026-09-06', () => {
    expect(monthAt('ethiopic', '2026-09-08')).toEqual({
      start: '2026-09-06',
      end: '2026-09-10',
      length: 5,
    });
  });

  it('Japanese months stay Gregorian across the era change of 2019-05-01', () => {
    expect(monthAt('japanese', '2019-04-30')).toEqual({
      start: '2019-04-01',
      end: '2019-04-30',
      length: 30,
    });
    expect(monthAt('japanese', '2019-05-01')).toEqual({
      start: '2019-05-01',
      end: '2019-05-31',
      length: 31,
    });
    expect(
      formatCalendarMonthLabel(
        'japanese',
        calendarMonthOf('japanese', iso('2019-04-30')),
        'en',
      ),
    ).toContain('Heisei');
    expect(
      formatCalendarMonthLabel(
        'japanese',
        calendarMonthOf('japanese', iso('2019-05-01')),
        'en',
      ),
    ).toContain('Reiwa');
  });

  it('Chinese 2023 has a leap second month after the second month', () => {
    const second = calendarMonthOf('chinese', iso('2023-03-01'));
    const leapSecond = calendarAddMonths('chinese', second, 1);
    expect(plainDateToISO(second.start)).toBe('2023-02-20');
    expect(second.length).toBe(30);
    expect(plainDateToISO(leapSecond.start)).toBe('2023-03-22');
    expect(leapSecond.length).toBe(29);
    expect(oracle('chinese', leapSecond.start).monthsInYear).toBe(13);
  });

  it('labels a Persian month in the calendar and the locale', () => {
    const aban = calendarMonthOf('persian', iso('2026-10-30'));
    expect(formatCalendarMonthLabel('persian', aban, 'en')).toContain(
      'Aban 1405',
    );
    expect(formatCalendarMonthLabel('persian', aban, 'fa-IR')).toContain(
      'آبان',
    );
  });
});

describe('calendar month invariants from 1900 through 2100', () => {
  const last = iso('2100-12-31');
  const temporalCalendars = CALENDAR_SYSTEMS.filter(
    calendar => !isGregorianAligned(calendar),
  );

  it.each(temporalCalendars)(
    '%s months are contiguous, of sane length, and 12 or 13 to a year',
    calendar => {
      let month: CalendarMonth = calendarMonthOf(calendar, iso('1900-01-01'));
      let monthsSinceYearStart: number | null = null;
      let expectedMonthsInYear = 0;
      while (!plainDateIsAfter(month.start, last)) {
        expect(month.length).toBeGreaterThanOrEqual(5);
        expect(month.length).toBeLessThanOrEqual(31);
        expect(isInCalendarMonth(month.start, month)).toBe(true);
        expect(isInCalendarMonth(month.end, month)).toBe(true);

        const position = oracle(calendar, month.start);
        if (position.month === 1) {
          if (monthsSinceYearStart != null) {
            expect(monthsSinceYearStart).toBe(expectedMonthsInYear);
          }
          monthsSinceYearStart = 0;
          expectedMonthsInYear = position.monthsInYear;
          expect([12, 13]).toContain(expectedMonthsInYear);
        }
        if (monthsSinceYearStart != null) {
          monthsSinceYearStart += 1;
        }

        const next = calendarAddMonths(calendar, month, 1);
        expect(plainDateToISO(next.start)).toBe(
          plainDateToISO(plainDateAddDays(month.end, 1)),
        );
        month = next;
      }
    },
  );

  it.each(['gregory', 'iso8601', 'buddhist', 'roc', 'japanese'] as const)(
    '%s months are the Gregorian months',
    calendar => {
      expect(monthAt(calendar, '2024-02-15')).toEqual({
        start: '2024-02-01',
        end: '2024-02-29',
        length: 29,
      });
    },
  );
});

describe('calendar month and year steps', () => {
  it('a month step keeps the day of the month and clamps it', () => {
    // 31 Shahrivar 1405 → Mehr has 30 days.
    expect(
      plainDateToISO(calendarShiftMonths('persian', iso('2026-09-22'), 1)),
    ).toBe('2026-10-22');
    expect(
      plainDateToISO(calendarShiftMonths('gregory', iso('2026-01-31'), 1)),
    ).toBe('2026-02-28');
  });

  it('a Hebrew year step from Adar I lands in Adar, clamped', () => {
    // 30 Adar I 5784 → 5785 has no Adar I; Adar has 29 days.
    expect(
      plainDateToISO(calendarShiftYears('hebrew', iso('2024-03-10'), 1)),
    ).toBe('2025-03-29');
  });

  it('an Ethiopic year step keeps the month, unlike twelve month steps', () => {
    const meskerem2018 = iso('2025-09-11');
    expect(
      plainDateToISO(calendarShiftMonths('ethiopic', meskerem2018, 12)),
    ).toBe('2026-09-06');
    expect(
      plainDateToISO(calendarShiftYears('ethiopic', meskerem2018, 1)),
    ).toBe('2026-09-11');
  });

  it('a Gregorian year step moves to the same day a year away, clamped', () => {
    expect(
      plainDateToISO(calendarShiftYears('gregory', iso('2026-06-15'), -1)),
    ).toBe('2025-06-15');
    expect(
      plainDateToISO(calendarShiftYears('gregory', iso('2024-02-29'), 1)),
    ).toBe('2025-02-28');
  });
});

describe('calendar availability and digits', () => {
  it('every calendar is available with the full polyfill', () => {
    for (const calendar of CALENDAR_SYSTEMS) {
      expect(isCalendarSystemAvailable(calendar)).toBe(true);
    }
  });

  it('writes day numbers in the locale digits', () => {
    expect(formatDayNumber(8, 'fa-IR')).toBe('۸');
    expect(formatDayNumber(28, 'en')).toBe('28');
  });
});

describe('calendar labels', () => {
  const day = iso('2027-02-06');
  const label = (calendar: CalendarSystem) =>
    formatCalendarDate(calendar, day, DATE_FORMAT_WITH_WEEKDAY, 'en');
  const heading = (calendar: CalendarSystem) =>
    formatCalendarMonthLabel(calendar, calendarMonthOf(calendar, day), 'en');

  it.each([
    ['gregory', '2027'],
    ['iso8601', '2027'],
    ['buddhist', '2570'],
    ['roc', '116'],
    ['japanese', 'Reiwa'],
  ] as const)(
    '%s names the Gregorian month, the day, and its own year',
    (calendar, year) => {
      expect(label(calendar)).toMatch(/^Saturday, February 6, /);
      expect(label(calendar)).toContain(year);
      expect(heading(calendar)).toMatch(/^February /);
      expect(heading(calendar)).toContain(year);
    },
  );

  it('labels iso8601 exactly as gregory', () => {
    expect(label('iso8601')).toBe(label('gregory'));
    expect(heading('iso8601')).toBe(heading('gregory'));
  });

  it('keeps the Intl label where Intl and Temporal agree', () => {
    expect(
      formatCalendarDate(
        'persian',
        iso('2026-10-30'),
        DATE_FORMAT_WITH_WEEKDAY,
        'en',
      ),
    ).toBe('Friday, Aban 8, 1405 AP');
  });
});

describe('dates from calendar fields', () => {
  const toISO = (pd: PlainDate | null) =>
    pd == null ? null : plainDateToISO(pd);

  it('converts calendar fields to the Gregorian date', () => {
    expect(
      toISO(
        calendarDateFromFields('persian', {
          year: 1405,
          monthCode: 'M08',
          day: 11,
        }),
      ),
    ).toBe('2026-11-02');
    expect(
      toISO(calendarDateFromFields('hebrew', {year: 5784, month: 6, day: 1})),
    ).toBe('2024-02-10');
    expect(
      toISO(
        calendarDateFromFields('ethiopic', {
          era: 'aa',
          eraYear: 7519,
          monthCode: 'M01',
          day: 1,
        }),
      ),
    ).toBe('2026-09-11');
  });

  it('returns null for a date the calendar does not have', () => {
    expect(
      calendarDateFromFields('persian', {
        year: 1404,
        monthCode: 'M12',
        day: 30,
      }),
    ).toBeNull();
    expect(
      calendarDateFromFields('hebrew', {year: 5785, monthCode: 'M05L', day: 1}),
    ).toBeNull();
    expect(
      calendarDateFromFields('ethiopic', {
        year: 2016,
        monthCode: 'M13',
        day: 6,
      }),
    ).toBeNull();
    expect(
      calendarDateFromFields('chinese', {
        year: 2026,
        monthCode: 'M06L',
        day: 1,
      }),
    ).toBeNull();
    expect(
      calendarDateFromFields('islamic-umalqura', {
        year: 1448,
        monthCode: 'M01',
        day: 30,
      }),
    ).toBeNull();
  });

  it('counts the months of the calendar year', () => {
    expect(calendarMonthsInYear('hebrew', iso('2024-02-10'))).toBe(13);
    expect(calendarMonthsInYear('hebrew', iso('2025-03-01'))).toBe(12);
    expect(calendarMonthsInYear('gregory', iso('2025-03-01'))).toBe(12);
  });
});
