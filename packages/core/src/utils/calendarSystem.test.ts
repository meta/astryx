// Copyright (c) Meta Platforms, Inc. and affiliates.

import 'temporal-polyfill/full/global';
import {afterEach, describe, expect, it} from 'vitest';
import {
  CALENDAR_SYSTEMS,
  type CalendarMonth,
  type CalendarSystem,
  calendarAddMonths,
  calendarDateFromFields,
  calendarDayOfMonth,
  calendarMonthFromYearMonth,
  calendarMonthOf,
  calendarMonthsInYear,
  calendarShiftMonths,
  calendarShiftYears,
  formatCalendarDate,
  formatCalendarInstant,
  formatCalendarInstantRange,
  formatCalendarMonthLabel,
  formatCalendarYearLabel,
  calendarYearSpansEras,
  isCalendarSystemAvailable,
  isGregorianAligned,
  isInCalendarMonth,
} from './calendarSystem';
import {
  DATE_FORMAT_WITH_WEEKDAY,
  formatSharedDate,
  getDaysInMonth,
  type PlainDate,
  plainDateAddDays,
  plainDateFormat,
  plainDateFromISO,
  plainDateIsAfter,
  plainDateToISO,
} from './plainDate';
import {withChineseTemporalAheadOfIntl} from '../__tests__/temporalAheadOfIntl';
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

describe('calendarMonthFromYearMonth past the end of its year', () => {
  const alignedYears: [CalendarSystem, number][] = [
    ['gregory', 2026],
    ['iso8601', 2026],
    ['buddhist', 2569],
    ['roc', 115],
    ['japanese', 2026],
  ];

  it.each(alignedYears)(
    '%s constrains a month past December to December',
    (calendar, year) => {
      const december = calendarMonthFromYearMonth(calendar, {year, month: 12});
      for (const month of [13, 14, 99]) {
        expect(calendarMonthFromYearMonth(calendar, {year, month})).toEqual(
          december,
        );
      }
      expect(december).toEqual({
        start: {year: 2026, month: 12, day: 1},
        end: {year: 2026, month: 12, day: 31},
        length: 31,
      });
    },
  );

  it.each(alignedYears)(
    '%s keeps every in-range month and its year offset',
    (calendar, year) => {
      for (const month of [1, 2, 6, 12]) {
        const built = calendarMonthFromYearMonth(calendar, {year, month});
        expect(built.start).toEqual({year: 2026, month, day: 1});
        expect(built.length).toBe(getDaysInMonth(2026, month));
        expect(built.end).toEqual({
          year: 2026,
          month,
          day: getDaysInMonth(2026, month),
        });
      }
    },
  );

  it('constrains a Hebrew month past the end of its year, leap or not', () => {
    const elul = calendarMonthFromYearMonth('hebrew', {year: 5784, month: 13});
    expect(
      calendarMonthFromYearMonth('hebrew', {year: 5784, month: 14}),
    ).toEqual(elul);
    expect(
      calendarMonthFromYearMonth('hebrew', {year: 5784, month: 99}),
    ).toEqual(elul);
    expect(
      calendarMonthFromYearMonth('hebrew', {year: 5783, month: 13}),
    ).toEqual(calendarMonthFromYearMonth('hebrew', {year: 5783, month: 12}));
  });
});

describe('calendar availability', () => {
  it('every calendar is available with the full polyfill', () => {
    for (const calendar of CALENDAR_SYSTEMS) {
      expect(isCalendarSystemAvailable(calendar)).toBe(true);
    }
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

describe('labels where Intl and Temporal disagree', () => {
  const day = iso('2027-02-06');
  const noon = new Date('2027-02-06T12:00:00Z');
  const longDate = {year: 'numeric', month: 'long', day: 'numeric'} as const;

  it('names the Temporal day in plainDateFormat and formatSharedDate', () => {
    withChineseTemporalAheadOfIntl(() => {
      const options = {
        month: 'long',
        day: 'numeric',
        calendar: 'chinese',
      } as const;
      expect(plainDateFormat(day, options, 'en')).toBe('First Month 1');
      expect(formatSharedDate(day, 'date_long', 'en', 'chinese')).toMatch(
        /^First Month 1, 2027/,
      );
    });
  });

  it('names the Temporal day of an instant and keeps its time', () => {
    const value = withChineseTemporalAheadOfIntl(() =>
      formatCalendarInstant(
        'chinese',
        noon,
        {...longDate, hour: 'numeric', minute: '2-digit'},
        'en',
        'UTC',
      ),
    );
    expect(value).toMatch(/^First Month 1, 2027\(ding-wei\) at 12:00\sPM$/);
  });

  it('writes each end of a range in full', () => {
    const value = withChineseTemporalAheadOfIntl(() =>
      formatCalendarInstantRange(
        'chinese',
        new Date('2027-02-01T12:00:00Z'),
        noon,
        longDate,
        'en',
        'UTC',
      ),
    );
    expect(value).toMatch(
      /^Twelfth Month 26, 2026\(bing-wu\)\s–\sFirst Month 1, 2027\(ding-wei\)$/,
    );
  });
});

describe('iso8601 labels', () => {
  const start = new Date('2027-02-01T12:00:00Z');
  const end = new Date('2027-02-06T12:00:00Z');
  const longDate = {year: 'numeric', month: 'long', day: 'numeric'} as const;

  it('writes dates, instants, and ranges as gregory does', () => {
    const day = iso('2027-02-06');
    expect(formatSharedDate(day, 'date', 'en', 'iso8601')).toBe(
      formatSharedDate(day, 'date', 'en'),
    );
    const dateTime = {...longDate, hour: 'numeric', minute: '2-digit'} as const;
    expect(formatCalendarInstant('iso8601', end, dateTime, 'en', 'UTC')).toBe(
      formatCalendarInstant('gregory', end, dateTime, 'en', 'UTC'),
    );
    expect(
      formatCalendarInstantRange('iso8601', start, end, longDate, 'en', 'UTC'),
    ).toMatch(/^February 1\s–\s6, 2027$/);
  });
});

describe('instants in the host zone', () => {
  const originalTZ = process.env.TZ;
  afterEach(() => {
    if (originalTZ === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTZ;
    }
  });

  it('follows a host zone change between calls', () => {
    const instant = new Date('2026-10-30T20:00:00Z');
    const options = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    } as const;
    process.env.TZ = 'UTC';
    expect(formatCalendarInstant('persian', instant, options, 'en')).toMatch(
      /^Aban 8, 1405 AP.* 8:00\sPM$/,
    );
    process.env.TZ = 'Asia/Tokyo';
    expect(formatCalendarInstant('persian', instant, options, 'en')).toMatch(
      /^Aban 9, 1405 AP.* 5:00\sAM$/,
    );
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

describe('formatCalendarYearLabel', () => {
  it.each([
    [2019, 1, 1, '平成31'],
    [2019, 4, 30, '平成31'],
    [2019, 5, 1, '令和元'],
    [2019, 7, 1, '令和元'],
    [1989, 1, 22, '平成元'],
    [1989, 1, 3, '昭和64'],
    [1989, 7, 1, '平成元'],
    [1926, 12, 31, '昭和元'],
    [1912, 7, 1, '明治45'],
  ])(
    'labels Japanese year %i with month %i and day %i as %s',
    (year, month, day, label) => {
      expect(
        formatCalendarYearLabel('japanese', year, 'ja-JP', {month, day}),
      ).toBe(label);
    },
  );

  it('clamps the day to the month', () => {
    expect(
      formatCalendarYearLabel('japanese', 1926, 'ja-JP', {month: 12, day: 99}),
    ).toBe('昭和元');
  });

  it('keeps one label for a year without an era change', () => {
    expect(
      formatCalendarYearLabel('japanese', 2020, 'ja-JP', {month: 1, day: 1}),
    ).toBe('令和2');
    expect(formatCalendarYearLabel('japanese', 2020, 'ja-JP')).toBe('令和2');
    expect(formatCalendarYearLabel('persian', 1405, 'en')).toBe('1405 AP');
    expect(formatCalendarYearLabel('roc', 1912, 'zh-TW')).toBe('民國1');
    expect(formatCalendarYearLabel('buddhist', 2026, 'th-TH')).toBe(
      'พ.ศ. 2569',
    );
    expect(formatCalendarYearLabel('chinese', 2027, 'zh')).toBe('2027');
    expect(formatCalendarYearLabel('gregory', 2026, 'en')).toBe('2026');
  });

  it('writes the era year in the locale order', () => {
    expect(
      formatCalendarYearLabel('japanese', 2019, 'en', {month: 1, day: 1}),
    ).toBe('31 Heisei');
  });

  it('finds the years that span an era change from the calendar data', () => {
    const spans = [1868, 1912, 1926, 1989, 2019, 2020].filter(year =>
      calendarYearSpansEras('japanese', year, 'ja-JP'),
    );
    expect(spans).toEqual([1868, 1912, 1926, 1989, 2019]);
    expect(calendarYearSpansEras('chinese', 2027, 'zh')).toBe(false);
    expect(calendarYearSpansEras('gregory', 2019, 'en')).toBe(false);
  });
});

describe('formatCalendarMonthLabel with a kept day', () => {
  const month = (isoDate: string) =>
    calendarMonthOf('japanese', iso(isoDate as ISODateString));

  it.each([
    ['1989-01-01', 3, '昭和64年1月'],
    ['1989-01-01', 22, '平成元年1月'],
    ['1926-12-01', 26, '昭和元年12月'],
    ['1926-12-01', 24, '大正15年12月'],
    ['1912-07-01', 30, '大正元年7月'],
    ['1868-10-01', 23, '明治元年10月'],
  ])('names the era of day %s + %i as %s', (start, day, label) => {
    expect(
      formatCalendarMonthLabel('japanese', month(start), 'ja-JP', day),
    ).toBe(label);
  });

  it('clamps the day to the month', () => {
    expect(
      formatCalendarMonthLabel('japanese', month('1926-12-01'), 'ja-JP', 99),
    ).toBe('昭和元年12月');
  });

  it('keeps the middle-of-month label for a month without an era change', () => {
    expect(
      formatCalendarMonthLabel('japanese', month('2019-01-01'), 'ja-JP', 22),
    ).toBe('平成31年1月');
    expect(
      formatCalendarMonthLabel('japanese', month('2019-05-01'), 'ja-JP', 1),
    ).toBe('令和元年5月');
    expect(
      formatCalendarMonthLabel(
        'persian',
        calendarMonthOf('persian', iso('2026-11-02')),
        'en',
        1,
      ),
    ).toBe(
      formatCalendarMonthLabel(
        'persian',
        calendarMonthOf('persian', iso('2026-11-02')),
        'en',
      ),
    );
    expect(
      formatCalendarMonthLabel('gregory', month('1989-01-01'), 'en', 3),
    ).toBe('January 1989');
  });

  it('keeps the middle-of-month label without a day', () => {
    expect(
      formatCalendarMonthLabel('japanese', month('1989-01-01'), 'ja-JP'),
    ).toBe('平成元年1月');
  });
});
