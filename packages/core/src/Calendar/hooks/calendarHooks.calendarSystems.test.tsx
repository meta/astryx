// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file calendarHooks.calendarSystems.test.tsx
 * @input useCalendarDays, useCalendarNavigation, Calendar, the full Temporal
 *   polyfill
 * @output Tests for the `calendar` option of the public calendar hooks, and
 *   for their output without it against the released algorithm
 * @position Colocated tests for the hooks; the polyfill stands in for the
 *   native Temporal of a supporting runtime
 */

import 'temporal-polyfill/full/global';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {ReactNode} from 'react';
import {act, render, renderHook, screen} from '@testing-library/react';
import {
  useCalendarDays,
  type CalendarDay,
  type UseCalendarDaysOptions,
} from './useCalendarDays';
import {
  useCalendarNavigation,
  type UseCalendarNavigationOptions,
} from './useCalendarNavigation';
import {Calendar} from '../Calendar';
import {InternationalizationProvider} from '../../i18n/InternationalizationProvider';
import {getWeekdayHeaderNames} from '../getWeekdayHeaderNames';
import type {DayOfWeek, ISODateString} from '../../utils/dateTypes';
import {
  type PlainDate,
  getDaysInMonth,
  plainDateAddDays,
  plainDateAddMonths,
  plainDateDayOfWeek,
  plainDateFormatStandaloneMonthYear,
  plainDateToISO,
} from '../../utils/plainDate';
import type {CalendarSystem} from '../../utils/calendarSystem';
import {__resetDevWarnings} from '../../utils/devWarning';
import {__resetLiveRegionsForTest} from '../../hooks/useAnnounce';

afterEach(() => {
  __resetDevWarnings();
  __resetLiveRegionsForTest();
  vi.restoreAllMocks();
});

// The day grid of the released hook, kept verbatim so that a change to the
// shared code path cannot move the Gregorian output.
function releasedDays(
  year: number,
  month: number,
  weekStartsOn: DayOfWeek,
  hasVariableRowCount: boolean,
): CalendarDay[] {
  const totalDaysInMonth = getDaysInMonth(year, month);
  let startingDayOfWeek =
    plainDateDayOfWeek({year, month, day: 1}) - weekStartsOn;
  if (startingDayOfWeek < 0) {
    startingDayOfWeek += 7;
  }
  const totalDays = totalDaysInMonth + startingDayOfWeek;
  const totalRows = hasVariableRowCount ? Math.ceil(totalDays / 7) : 6;
  const firstOfMonth: PlainDate = {year, month, day: 1};
  const result: CalendarDay[] = [];
  for (let i = 0; i < totalRows * 7; i++) {
    const dayOffset = i - startingDayOfWeek + 1;
    const isOutside = dayOffset < 1 || dayOffset > totalDaysInMonth;
    const pd: PlainDate = isOutside
      ? plainDateAddDays(firstOfMonth, dayOffset - 1)
      : {year, month, day: dayOffset};
    result.push({
      date: pd,
      iso: plainDateToISO(pd),
      isOutside,
      dayNumber: pd.day,
    });
  }
  return result;
}

function inMonth(days: CalendarDay[]): CalendarDay[] {
  return days.filter(day => !day.isOutside);
}

function persianProvider({children}: {children: ReactNode}) {
  return (
    <InternationalizationProvider locale="en" calendar="persian">
      {children}
    </InternationalizationProvider>
  );
}

function withoutTemporal(run: () => void) {
  const globals = globalThis as {Temporal?: unknown};
  const saved = globals.Temporal;
  delete globals.Temporal;
  try {
    run();
  } finally {
    globals.Temporal = saved;
  }
}

describe('useCalendarDays without calendar', () => {
  const cases: [string, UseCalendarDaysOptions][] = [
    // May 2026 starts on a Friday, so its 31 days reach a sixth row.
    ['a six-row month', {year: 2026, month: 5}],
    ['a 28-day month on weekStartsOn', {year: 2026, month: 2}],
    ['a leap February', {year: 2024, month: 2, weekStartsOn: 1}],
    ['a variable-row month', {year: 2026, month: 2, hasVariableRowCount: true}],
    [
      'a variable-row month with six rows',
      {year: 2026, month: 8, hasVariableRowCount: true},
    ],
    ['a month across a year end', {year: 2025, month: 12, weekStartsOn: 6}],
  ];

  it.each(cases)('matches the released output for %s', (_name, options) => {
    const {result} = renderHook(() => useCalendarDays(options));
    const weekStartsOn = options.weekStartsOn ?? 0;
    const expected = releasedDays(
      options.year,
      options.month,
      weekStartsOn,
      options.hasVariableRowCount ?? false,
    );
    expect(result.current.days).toEqual(expected);
    expect(result.current.totalCells).toBe(expected.length);
    expect(result.current.weeks.flat()).toEqual(expected);
    expect(result.current.dayNames).toEqual(
      getWeekdayHeaderNames('en', weekStartsOn),
    );
  });

  it('includes the six-row and variable-row shapes', () => {
    const fixed = renderHook(() => useCalendarDays({year: 2026, month: 8}));
    const variable = renderHook(() =>
      useCalendarDays({year: 2026, month: 2, hasVariableRowCount: true}),
    );
    // August 2026 starts on a Saturday: its 30th and 31st fill the sixth row.
    expect(inMonth(fixed.result.current.weeks[5])).toHaveLength(2);
    expect(variable.result.current.weeks).toHaveLength(4);
  });

  it('gives the same output with calendar gregory', () => {
    const options = {year: 2026, month: 5, weekStartsOn: 1} as const;
    const plain = renderHook(() => useCalendarDays(options));
    const gregory = renderHook(() =>
      useCalendarDays({...options, calendar: 'gregory'}),
    );
    expect(gregory.result.current).toEqual(plain.result.current);
  });
});

describe('useCalendarDays with calendar', () => {
  it('lays out Aban 1405 in the Persian calendar', () => {
    const {result} = renderHook(() =>
      useCalendarDays({year: 1405, month: 8, calendar: 'persian'}),
    );
    const days = inMonth(result.current.days);
    expect(days.map(day => day.dayNumber)).toEqual(
      Array.from({length: 30}, (_, i) => i + 1),
    );
    expect(days[0]).toEqual({
      date: {year: 2026, month: 10, day: 23},
      iso: '2026-10-23',
      isOutside: false,
      dayNumber: 1,
    });
    expect(days[29].iso).toBe('2026-11-21');
    // 2026-10-23 is a Friday: five Mehr days lead the first row.
    expect(result.current.days[0]).toMatchObject({
      iso: '2026-10-18',
      isOutside: true,
      dayNumber: 26,
    });
    expect(result.current.totalCells).toBe(42);
    expect(result.current.dayNames).toEqual(getWeekdayHeaderNames('en', 0));
  });

  it('reads Hebrew leap-year months as Temporal numbers them', () => {
    const month = (n: number) =>
      inMonth(
        renderHook(() =>
          useCalendarDays({year: 5784, month: n, calendar: 'hebrew'}),
        ).result.current.days,
      );
    const adarI = month(6);
    const adarII = month(7);
    const elul = month(13);
    expect([adarI[0].iso, adarI.length]).toEqual(['2024-02-10', 30]);
    expect([adarII[0].iso, adarII.length]).toEqual(['2024-03-11', 29]);
    expect([elul[0].iso, elul.length]).toEqual(['2024-09-04', 29]);
    expect(elul.map(day => day.dayNumber).at(-1)).toBe(29);
  });

  it('reads the year numbers of the Buddhist and Minguo calendars', () => {
    const buddhist = renderHook(() =>
      useCalendarDays({year: 2569, month: 10, calendar: 'buddhist'}),
    );
    const roc = renderHook(() =>
      useCalendarDays({year: 115, month: 10, calendar: 'roc'}),
    );
    const expected = releasedDays(2026, 10, 0, false);
    expect(buddhist.result.current.days).toEqual(expected);
    expect(roc.result.current.days).toEqual(expected);
  });

  it('ignores the provider calendar', () => {
    const {result} = renderHook(
      () => useCalendarDays({year: 2026, month: 10}),
      {
        wrapper: persianProvider,
      },
    );
    expect(result.current.days).toEqual(releasedDays(2026, 10, 0, false));
  });
});

describe('useCalendarNavigation without calendar', () => {
  it.each(['en', 'th-TH', 'fa-IR', 'ca'])(
    'matches the released months and label in %s',
    locale => {
      const options: UseCalendarNavigationOptions = {
        initialValue: '2026-01-15',
        numberOfMonths: 2,
      };
      const {result} = renderHook(() => useCalendarNavigation(options), {
        wrapper: ({children}) => (
          <InternationalizationProvider locale={locale}>
            {children}
          </InternationalizationProvider>
        ),
      });
      const first = {year: 2026, month: 1, day: 1};
      const months = [first, plainDateAddMonths(first, 1)];
      expect(result.current.baseMonth).toEqual(first);
      expect(result.current.visibleMonths).toEqual(months);
      expect(result.current.visibleCalendarMonths).toEqual([
        {year: 2026, month: 1},
        {year: 2026, month: 2},
      ]);
      expect(result.current.monthYearLabel).toBe(
        months
          .map(m => plainDateFormatStandaloneMonthYear(m, locale))
          .join(' – '),
      );
    },
  );

  it('ignores the provider calendar', () => {
    const {result} = renderHook(
      () => useCalendarNavigation({initialValue: '2026-10-30'}),
      {wrapper: persianProvider},
    );
    expect(result.current.baseMonth).toEqual({year: 2026, month: 10, day: 1});
    expect(result.current.monthYearLabel).toBe('October 2026');
    act(() => result.current.navigateMonth(1));
    expect(result.current.baseMonth).toEqual({year: 2026, month: 11, day: 1});
  });
});

describe('useCalendarNavigation with calendar', () => {
  it('steps Persian months and labels them in the calendar', () => {
    const {result} = renderHook(() =>
      useCalendarNavigation({initialValue: '2026-10-30', calendar: 'persian'}),
    );
    expect(result.current.baseMonth).toEqual({year: 2026, month: 10, day: 23});
    expect(result.current.visibleCalendarMonths).toEqual([
      {year: 1405, month: 8},
    ]);
    expect(result.current.monthYearLabel).toBe('Aban 1405 AP');

    act(() => result.current.navigateMonth(1));
    expect(result.current.baseMonth).toEqual({year: 2026, month: 11, day: 22});
    expect(result.current.visibleCalendarMonths).toEqual([
      {year: 1405, month: 9},
    ]);
    expect(result.current.monthYearLabel).toBe('Azar 1405 AP');

    act(() => result.current.navigateMonth(-9));
    expect(result.current.visibleCalendarMonths).toEqual([
      {year: 1404, month: 12},
    ]);
  });

  it('steps through Adar I, Adar II, and the thirteenth month', () => {
    const {result} = renderHook(() =>
      useCalendarNavigation({initialValue: '2024-02-15', calendar: 'hebrew'}),
    );
    expect(result.current.visibleCalendarMonths).toEqual([
      {year: 5784, month: 6},
    ]);
    expect(result.current.monthYearLabel).toBe('Adar I 5784');
    act(() => result.current.navigateMonth(1));
    expect(result.current.monthYearLabel).toBe('Adar II 5784');
    act(() => result.current.navigateMonth(6));
    expect(result.current.visibleCalendarMonths).toEqual([
      {year: 5784, month: 13},
    ]);
    expect(result.current.baseMonth).toEqual({year: 2024, month: 9, day: 4});
  });

  it('reports a controlled month change as the Gregorian first day', () => {
    const onFocusDateChange = vi.fn();
    const {result} = renderHook(() =>
      useCalendarNavigation({
        focusDate: '2026-10-30',
        onFocusDateChange,
        calendar: 'persian',
      }),
    );
    act(() => result.current.navigateMonth(-1, '2026-10-24', 7));
    expect(onFocusDateChange).toHaveBeenCalledWith('2026-09-23');
    expect(result.current.pendingFocus).toBe('2026-10-17');
  });

  it.each<[CalendarSystem, ISODateString, 1 | 2]>([
    ['persian', '2026-10-30', 2],
    ['hebrew', '2024-02-15', 2],
    ['japanese', '2019-04-30', 1],
    ['buddhist', '2026-10-30', 1],
  ])('labels %s months as Calendar heads them', (calendar, iso, n) => {
    const {result} = renderHook(() =>
      useCalendarNavigation({
        initialValue: iso,
        numberOfMonths: n,
        calendar,
      }),
    );
    render(<Calendar calendar={calendar} focusDate={iso} numberOfMonths={n} />);
    expect(
      screen.getByText(result.current.monthYearLabel, {selector: 'span'}),
    ).toBeInTheDocument();
  });

  it.each<[CalendarSystem, ISODateString]>([
    ['persian', '2026-10-30'],
    ['hebrew', '2024-08-15'],
    ['ethiopic', '2026-09-08'],
    ['chinese', '2025-07-01'],
    ['roc', '2026-10-30'],
  ])(
    'feeds visibleCalendarMonths into useCalendarDays in %s',
    (calendar, iso) => {
      const {result} = renderHook(() => {
        const nav = useCalendarNavigation({
          initialValue: iso,
          numberOfMonths: 2,
          calendar,
        });
        const grids = [
          useCalendarDays({...nav.visibleCalendarMonths[0], calendar}),
          useCalendarDays({...nav.visibleCalendarMonths[1], calendar}),
        ];
        return {nav, grids};
      });
      const {nav, grids} = result.current;
      grids.forEach((grid, i) => {
        const days = inMonth(grid.days);
        expect(days[0].date).toEqual(nav.visibleMonths[i]);
        expect(days[0].dayNumber).toBe(1);
      });
      // The second grid starts the day after the first grid ends.
      expect(plainDateAddDays(inMonth(grids[0].days).at(-1)!.date, 1)).toEqual(
        nav.visibleMonths[1],
      );
    },
  );
});

describe('the calendar hooks without Temporal', () => {
  it('fall back to Gregorian months and warn once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    withoutTemporal(() => {
      const days = renderHook(() =>
        useCalendarDays({year: 2026, month: 10, calendar: 'persian'}),
      );
      expect(days.result.current.days).toEqual(
        releasedDays(2026, 10, 0, false),
      );
      const nav = renderHook(() =>
        useCalendarNavigation({
          initialValue: '2026-10-30',
          calendar: 'persian',
        }),
      );
      expect(nav.result.current.monthYearLabel).toBe('October 2026');
      expect(nav.result.current.visibleCalendarMonths).toEqual([
        {year: 2026, month: 10},
      ]);
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain(
      'needs a Temporal that supports it',
    );
  });

  it('keeps Gregorian-aligned calendars without a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    withoutTemporal(() => {
      const {result} = renderHook(() =>
        useCalendarNavigation({
          initialValue: '2026-10-30',
          calendar: 'buddhist',
        }),
      );
      expect(result.current.visibleCalendarMonths).toEqual([
        {year: 2569, month: 10},
      ]);
      expect(result.current.monthYearLabel).toContain('2569');
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('constrains a month past the end of the fallback year to its last month', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    withoutTemporal(() => {
      const past = renderHook(() =>
        useCalendarDays({year: 5784, month: 13, calendar: 'hebrew'}),
      );
      expect(past.result.current.days).toEqual(
        releasedDays(5784, 12, 0, false),
      );
      const gregorian = renderHook(() =>
        useCalendarDays({year: 2026, month: 13}),
      );
      expect(gregorian.result.current.days).toEqual(
        releasedDays(2026, 12, 0, false),
      );
    });
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
