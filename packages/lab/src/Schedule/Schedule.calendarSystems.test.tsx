// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Schedule.calendarSystems.test.tsx
 * @input Schedule views, the shared date formatters, the full Temporal
 *   polyfill
 * @output Tests that Schedule date labels follow the provider's calendar
 * @position Colocated tests; the polyfill stands in for the native Temporal of
 *   a supporting runtime
 */

import 'temporal-polyfill/full/global';
import {afterAll, afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import {InternationalizationProvider} from '@astryxdesign/core/i18n';
import type {CalendarSystem} from '@astryxdesign/core/internal/calendar-system';
import {Schedule} from './Schedule';
import {createScheduleDayView} from './DayView';
import {createScheduleMonthlyView} from './MonthlyView';
import {
  formatDayNumber,
  formatEventDateTimeRange,
  formatFullDate,
  formatMonthTitle,
  formatWeekRange,
  formatWeekTitle,
} from './shared';
import type {CalendarInstantEvent, Instant} from './types';

const DATE = {year: 2026, month: 10, day: 30};
const NOON = new Date(Date.UTC(2026, 9, 30, 12));

const CALENDAR_LOCALES = [
  {calendar: 'persian', locale: 'en', year: '1405'},
  {calendar: 'persian', locale: 'fa', year: '۱۴۰۵'},
  {calendar: 'hebrew', locale: 'en', year: '5787'},
  {calendar: 'hebrew', locale: 'he', year: '5787'},
  {calendar: 'buddhist', locale: 'en', year: '2569'},
  {calendar: 'buddhist', locale: 'th', year: '2569'},
] as const;

function oracle(
  locale: string,
  calendar: CalendarSystem,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone: 'UTC',
    calendar,
  }).format(NOON);
}

function oracleAt(
  instant: number,
  locale: string,
  calendar: CalendarSystem,
): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
    calendar,
  }).format(instant);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(CALENDAR_LOCALES)(
  'Schedule date labels in $calendar under $locale',
  ({calendar, locale, year}) => {
    it('writes the full date in the calendar', () => {
      const value = formatFullDate(DATE, locale, calendar);
      expect(value).toBe(
        oracle(locale, calendar, {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }),
      );
      expect(value).toContain(year);
      expect(value).not.toContain('2026');
    });

    it('writes the month title in the calendar', () => {
      const value = formatMonthTitle(DATE, locale, calendar);
      expect(value).toBe(
        oracle(locale, calendar, {month: 'long', year: 'numeric'}),
      );
      expect(value).toContain(year);
    });

    it('writes the day number in the calendar', () => {
      expect(formatDayNumber(DATE, locale, calendar)).toBe(
        oracle(locale, calendar, {day: 'numeric'}),
      );
    });

    it('writes a week range in the calendar', () => {
      const value = formatWeekRange(
        {year: 2026, month: 10, day: 25},
        {year: 2026, month: 10, day: 31},
        'UTC',
        locale,
        calendar,
      );
      expect(value).toContain(year);
      expect(value).not.toContain('2026');
    });

    it('writes the dates of a long timed event in the calendar, with its times', () => {
      const event: CalendarInstantEvent = {
        id: 'offsite',
        title: 'Offsite',
        start: Date.UTC(2026, 9, 30, 9) as Instant,
        end: Date.UTC(2026, 10, 2, 17) as Instant,
      };
      const value = formatEventDateTimeRange(event, 'UTC', locale, calendar);
      expect(value).toBe(
        new Intl.DateTimeFormat(locale, {
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZone: 'UTC',
          calendar,
        }).formatRange(new Date(event.start), new Date(event.end)),
      );
    });
  },
);

describe('Schedule ranges in another calendar', () => {
  it('titles a month with an era change by its middle, as Calendar does', () => {
    // Heisei starts on January 8, 1989. Gregorian January 1989 is one month.
    const title = formatWeekTitle(
      {year: 1989, month: 1, day: 1},
      {year: 1989, month: 1, day: 31},
      'en',
      'japanese',
    );
    expect(title).toBe(oracleAt(Date.UTC(1989, 0, 16, 12), 'en', 'japanese'));
    expect(title).not.toContain('Shōwa');
  });

  it('names both calendar months when a Gregorian month spans two', () => {
    expect(
      formatWeekTitle(
        {year: 2026, month: 10, day: 1},
        {year: 2026, month: 10, day: 31},
        'en',
        'persian',
      ),
    ).toBe('Mehr - Aban 1405 AP');
  });

  it('keeps one Gregorian month as one title', () => {
    expect(
      formatWeekTitle(
        {year: 2026, month: 10, day: 1},
        {year: 2026, month: 10, day: 31},
        'en',
        'gregory',
      ),
    ).toBe('October 2026');
  });
});

function renderMonth(provider: {locale: string; calendar?: CalendarSystem}) {
  return render(
    <InternationalizationProvider {...provider}>
      <Schedule
        view={createScheduleMonthlyView()}
        events={[]}
        date={Date.UTC(2026, 9, 30)}
        focusDate={Date.UTC(2026, 9, 30)}
        timezoneID="UTC"
      />
    </InternationalizationProvider>,
  );
}

describe('Schedule views under a provider calendar', () => {
  it('titles the month view with the calendar months it shows', () => {
    renderMonth({locale: 'en', calendar: 'persian'});
    expect(
      screen.getByRole('table', {name: 'Mehr - Aban 1405 AP'}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('cell', {
        name: formatFullDate(DATE, 'en', 'persian'),
      }),
    ).toBeInTheDocument();
  });

  it('keeps the Gregorian month view without a provider calendar', () => {
    renderMonth({locale: 'fa-IR'});
    expect(
      screen.getByRole('table', {
        name: formatMonthTitle(DATE, 'fa-IR', 'gregory'),
      }),
    ).toBeInTheDocument();
  });

  it('names a long timed event with Gregorian dates without a provider calendar', () => {
    const event: CalendarInstantEvent = {
      id: 'offsite',
      title: 'Offsite',
      start: Date.UTC(2026, 9, 26, 9) as Instant,
      end: Date.UTC(2026, 9, 28, 17) as Instant,
    };
    render(
      <InternationalizationProvider locale="fa-IR">
        <Schedule
          view={createScheduleDayView()}
          events={[event]}
          date={Date.UTC(2026, 9, 27)}
          focusDate={Date.UTC(2026, 9, 27)}
          timezoneID="UTC"
        />
      </InternationalizationProvider>,
    );
    const range = (calendar: CalendarSystem) =>
      new Intl.DateTimeFormat('fa-IR', {
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'UTC',
        calendar,
      }).formatRange(new Date(event.start), new Date(event.end));
    const labels = Array.from(
      document.querySelectorAll('[aria-label]'),
      element => element.getAttribute('aria-label') ?? '',
    ).filter(label => label.includes('Offsite'));
    expect(labels).not.toHaveLength(0);
    for (const label of labels) {
      expect(label).toContain(range('gregory'));
      expect(label).not.toContain(range('persian'));
    }
  });

  it('writes `iso8601` titles and ranges as Gregorian ones', () => {
    renderMonth({locale: 'en', calendar: 'iso8601'});
    expect(
      screen.getAllByText(
        (_, element) => element?.textContent === 'October 2026',
      ),
    ).not.toHaveLength(0);
    const start = {year: 2026, month: 10, day: 25};
    const end = {year: 2026, month: 10, day: 31};
    expect(formatWeekRange(start, end, 'UTC', 'en', 'iso8601')).toBe(
      formatWeekRange(start, end, 'UTC', 'en', 'gregory'),
    );
    const event: CalendarInstantEvent = {
      id: 'offsite',
      title: 'Offsite',
      start: Date.UTC(2026, 9, 30, 9) as Instant,
      end: Date.UTC(2026, 10, 2, 17) as Instant,
    };
    expect(formatEventDateTimeRange(event, 'UTC', 'en', 'iso8601')).toBe(
      formatEventDateTimeRange(event, 'UTC', 'en', 'gregory'),
    );
  });

  it('labels the day view with the date in the calendar', () => {
    render(
      <InternationalizationProvider locale="en" calendar="hebrew">
        <Schedule
          view={createScheduleDayView()}
          events={[]}
          date={Date.UTC(2026, 9, 30)}
          focusDate={Date.UTC(2026, 9, 30)}
          timezoneID="UTC"
        />
      </InternationalizationProvider>,
    );
    expect(
      screen.getAllByText(formatFullDate(DATE, 'en', 'hebrew')).length,
    ).toBeGreaterThan(0);
  });

  describe('without Temporal', () => {
    const globals = globalThis as {Temporal?: unknown};
    let savedTemporal: unknown;

    beforeAll(() => {
      savedTemporal = globals.Temporal;
      delete globals.Temporal;
    });

    afterAll(() => {
      globals.Temporal = savedTemporal;
    });

    it('shows Gregorian labels for a calendar that needs Temporal', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      renderMonth({locale: 'en', calendar: 'persian'});
      expect(
        screen.getByRole('table', {name: 'October 2026'}),
      ).toBeInTheDocument();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('The "persian" calendar needs a Temporal'),
      );
    });

    it('still shows the buddhist calendar, which needs no Temporal', () => {
      renderMonth({locale: 'en', calendar: 'buddhist'});
      expect(
        screen.getByRole('table', {name: 'October 2569 BE'}),
      ).toBeInTheDocument();
    });
  });
});
