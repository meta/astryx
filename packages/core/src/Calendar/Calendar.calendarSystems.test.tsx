// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Calendar.calendarSystems.test.tsx
 * @input Calendar, InternationalizationProvider, the full Temporal polyfill
 * @output Tests for Calendar months, labels, navigation, and values in
 *   calendar systems other than Gregorian
 * @position Colocated tests for Calendar.tsx; the polyfill stands in for the
 *   native Temporal of a supporting runtime
 */

import 'temporal-polyfill/full/global';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Calendar} from './Calendar';
import {DateInput} from '../DateInput/DateInput';
import {DateRangeInput} from '../DateRangeInput/DateRangeInput';
import {
  DateTimeInput,
  type ISODateTimeString,
} from '../DateTimeInput/DateTimeInput';
import {InternationalizationProvider} from '../i18n/InternationalizationProvider';
import {__resetLiveRegionsForTest} from '../hooks/useAnnounce';

afterEach(() => {
  __resetLiveRegionsForTest();
});

function dayButton(iso: string): HTMLElement {
  const button = document.querySelector<HTMLElement>(
    `button[data-date="${iso}"]`,
  );
  if (button == null) {
    throw new Error(`No day button for ${iso}`);
  }
  return button;
}

function inMonthDates(grid: HTMLElement): string[] {
  return within(grid)
    .getAllByRole('gridcell')
    .map(cell => cell.querySelector('button'))
    .filter(
      (button): button is HTMLButtonElement =>
        button != null && !button.hasAttribute('aria-disabled'),
    )
    .map(button => button.getAttribute('data-date') ?? '');
}

function focusedDate(): string | null {
  return document.activeElement?.getAttribute('data-date') ?? null;
}

describe('Calendar in the Persian calendar', () => {
  it('lays out Aban 1405 with its calendar day numbers and labels', () => {
    render(<Calendar calendar="persian" focusDate="2026-10-30" />);
    const grid = screen.getByRole('grid');
    expect(grid.getAttribute('aria-label')).toContain('Aban 1405');

    const dates = inMonthDates(grid);
    expect(dates).toHaveLength(30);
    expect(dates[0]).toBe('2026-10-23');
    expect(dates[29]).toBe('2026-11-21');

    expect(dayButton('2026-10-23')).toHaveTextContent(/^1$/);
    expect(dayButton('2026-10-30')).toHaveTextContent(/^8$/);
    expect(dayButton('2026-10-30').getAttribute('aria-label')).toMatch(
      /Friday, Aban 8, 1405/,
    );
  });

  it('keeps the fixed six-row grid', () => {
    render(<Calendar calendar="persian" focusDate="2026-10-30" />);
    expect(
      within(screen.getByRole('grid')).getAllByRole('gridcell'),
    ).toHaveLength(42);
  });

  it('reports a pick as a Gregorian ISO date', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Calendar
        calendar="persian"
        focusDate="2026-10-30"
        onChange={onChange}
      />,
    );
    await user.click(dayButton('2026-10-30'));
    expect(onChange).toHaveBeenCalledWith('2026-10-30', expect.any(Date));
  });

  it('steps one calendar month with Previous and Next', async () => {
    const user = userEvent.setup();
    render(<Calendar calendar="persian" defaultValue="2026-10-30" />);
    await user.click(screen.getByRole('button', {name: 'Next month'}));
    expect(screen.getByRole('grid').getAttribute('aria-label')).toContain(
      'Azar 1405',
    );
    expect(inMonthDates(screen.getByRole('grid'))[0]).toBe('2026-11-22');

    await user.click(screen.getByRole('button', {name: 'Previous month'}));
    await user.click(screen.getByRole('button', {name: 'Previous month'}));
    expect(screen.getByRole('grid').getAttribute('aria-label')).toContain(
      'Mehr 1405',
    );
  });

  it('pages one calendar month and clamps the day of the month', async () => {
    const user = userEvent.setup();
    // 31 Shahrivar 1405; Mehr has 30 days.
    render(<Calendar calendar="persian" defaultValue="2026-09-22" />);
    dayButton('2026-09-22').focus();
    await user.keyboard('{PageDown}');
    await waitFor(() => expect(focusedDate()).toBe('2026-10-22'));
    // 30 Mehr → 30 Shahrivar: the day of the month stays 30.
    await user.keyboard('{PageUp}');
    await waitFor(() => expect(focusedDate()).toBe('2026-09-21'));
  });

  it('bounds the month buttons by day', () => {
    render(
      <Calendar
        calendar="persian"
        focusDate="2026-10-30"
        min="2026-10-23"
        max="2026-11-22"
      />,
    );
    // min is the first day of Aban: no earlier day is in range.
    expect(screen.getByRole('button', {name: 'Previous month'})).toBeDisabled();
    // max is the first day of Azar: a later day is in range.
    expect(screen.getByRole('button', {name: 'Next month'})).toBeEnabled();
  });

  it('shows ISO 8601 week numbers', () => {
    render(
      <Calendar
        calendar="persian"
        focusDate="2026-10-30"
        weekStartsOn="mon"
        hasWeekNumbers
      />,
    );
    const row = dayButton('2026-10-30').closest('[role="row"]');
    expect(row?.querySelector('[role="rowheader"]')?.textContent).toBe('44');
  });

  it('writes day numbers and labels in the locale', () => {
    render(
      <InternationalizationProvider locale="fa-IR" calendar="persian">
        <Calendar focusDate="2026-10-30" />
      </InternationalizationProvider>,
    );
    expect(dayButton('2026-10-30')).toHaveTextContent(/^۸$/);
    expect(screen.getByRole('grid').getAttribute('aria-label')).toContain(
      'آبان',
    );
  });
});

describe('Calendar in the Hebrew calendar', () => {
  it('shows Adar I and Adar II as distinct months of a leap year', async () => {
    const user = userEvent.setup();
    render(<Calendar calendar="hebrew" focusDate="2024-02-20" />);
    expect(screen.getByRole('grid').getAttribute('aria-label')).toContain(
      'Adar I 5784',
    );
    expect(inMonthDates(screen.getByRole('grid'))).toHaveLength(30);
    await user.click(screen.getByRole('button', {name: 'Next month'}));
    expect(screen.getByRole('grid').getAttribute('aria-label')).toContain(
      'Adar II 5784',
    );
    expect(inMonthDates(screen.getByRole('grid'))).toHaveLength(29);
  });

  it('steps a year from Adar I to Adar with Shift+PageDown, clamped', async () => {
    const user = userEvent.setup();
    // 30 Adar I 5784; 5785 has no Adar I, and its Adar has 29 days.
    render(<Calendar calendar="hebrew" defaultValue="2024-03-10" />);
    dayButton('2024-03-10').focus();
    await user.keyboard('{Shift>}{PageDown}{/Shift}');
    await waitFor(() => expect(focusedDate()).toBe('2025-03-29'));
    expect(screen.getByRole('grid').getAttribute('aria-label')).toContain(
      'Adar 5785',
    );
  });
});

describe('Calendar in the Ethiopic calendar', () => {
  it('keeps six rows for the five-day thirteenth month', () => {
    render(<Calendar calendar="ethiopic" focusDate="2026-09-08" />);
    const grid = screen.getByRole('grid');
    expect(grid.getAttribute('aria-label')).toContain('Pagumen 2018');
    expect(inMonthDates(grid)).toEqual([
      '2026-09-06',
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
    ]);
    expect(within(grid).getAllByRole('gridcell')).toHaveLength(42);
  });

  it('gives the thirteenth month only its rows with hasVariableRowCount', () => {
    render(
      <Calendar
        calendar="ethiopic"
        focusDate="2026-09-08"
        hasVariableRowCount
      />,
    );
    // 2026-09-06 is a Sunday, so the five days fill one row.
    expect(
      within(screen.getByRole('grid')).getAllByRole('gridcell'),
    ).toHaveLength(7);
  });

  it('steps a year to the same month with Shift+PageUp', async () => {
    const user = userEvent.setup();
    // 1 Meskerem 2019 → 1 Meskerem 2018.
    render(<Calendar calendar="ethiopic" defaultValue="2026-09-11" />);
    dayButton('2026-09-11').focus();
    await user.keyboard('{Shift>}{PageUp}{/Shift}');
    await waitFor(() => expect(focusedDate()).toBe('2025-09-11'));
  });
});

interface TestPlainDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly daysInMonth: number;
  with(fields: {day: number}): TestPlainDate;
  add(duration: object): TestPlainDate;
  subtract(duration: object): TestPlainDate;
  withCalendar(calendar: string): TestPlainDate;
}

type TestPlainDateConstructor = new (
  isoYear: number,
  isoMonth: number,
  isoDay: number,
  calendar: string,
) => TestPlainDate;

/**
 * Runs `run` with a Temporal whose Chinese calendar is one day ahead of
 * Intl's, as native Temporal is at some month starts, such as 2027-02-06.
 */
function withChineseTemporalAheadOfIntl(run: () => void) {
  const globals = globalThis as unknown as {
    Temporal: {PlainDate: TestPlainDateConstructor};
  };
  const real = globals.Temporal;
  const shift = (inner: TestPlainDate): TestPlainDate => ({
    year: inner.year,
    month: inner.month,
    day: inner.day,
    daysInMonth: inner.daysInMonth,
    with: fields => shift(inner.with(fields)),
    add: duration => shift(inner.add(duration)),
    subtract: duration => shift(inner.subtract(duration)),
    withCalendar: calendar => inner.withCalendar(calendar).subtract({days: 1}),
  });
  function PlainDate(y: number, m: number, d: number, calendar: string) {
    return calendar === 'chinese'
      ? shift(
          new real.PlainDate(y, m, d, 'iso8601')
            .add({days: 1})
            .withCalendar('chinese'),
        )
      : new real.PlainDate(y, m, d, calendar);
  }
  globals.Temporal = {
    PlainDate: PlainDate as unknown as TestPlainDateConstructor,
  };
  try {
    run();
  } finally {
    globals.Temporal = real;
  }
}

describe('Calendar in the Chinese calendar', () => {
  it('names each day by the month and day the grid shows when Intl disagrees', () => {
    withChineseTemporalAheadOfIntl(() => {
      render(<Calendar calendar="chinese" focusDate="2027-02-06" />);
      // Intl alone calls this day "Saturday, Twelfth Month 30, 2026".
      expect(dayButton('2027-02-06')).toHaveTextContent(/^1$/);
      expect(dayButton('2027-02-06').getAttribute('aria-label')).toMatch(
        /^Saturday, First Month 1, 2027/,
      );
      expect(screen.getByRole('grid').getAttribute('aria-label')).toContain(
        'First Month',
      );
      // A day inside the month keeps Intl's own label.
      expect(dayButton('2027-02-20').getAttribute('aria-label')).toMatch(
        /^Saturday, First Month 15, 2027/,
      );
    });
  });
});

describe('Calendar in the Japanese calendar', () => {
  it('names the era of each month', async () => {
    const user = userEvent.setup();
    render(<Calendar calendar="japanese" focusDate="2019-04-30" />);
    expect(screen.getByRole('grid').getAttribute('aria-label')).toContain(
      'Heisei',
    );
    await user.click(screen.getByRole('button', {name: 'Next month'}));
    expect(screen.getByRole('grid').getAttribute('aria-label')).toContain(
      'Reiwa',
    );
  });
});

describe('Calendar year paging in the Gregorian calendar', () => {
  it('moves to the same day a year away with Shift+PageUp and Shift+PageDown', async () => {
    const user = userEvent.setup();
    render(<Calendar defaultValue="2026-06-15" />);
    dayButton('2026-06-15').focus();
    await user.keyboard('{Shift>}{PageUp}{/Shift}');
    await waitFor(() => expect(focusedDate()).toBe('2025-06-15'));
    await user.keyboard('{Shift>}{PageDown}{/Shift}');
    await waitFor(() => expect(focusedDate()).toBe('2026-06-15'));
  });

  it('clamps February 29 to February 28', async () => {
    const user = userEvent.setup();
    render(<Calendar defaultValue="2024-02-29" />);
    dayButton('2024-02-29').focus();
    await user.keyboard('{Shift>}{PageDown}{/Shift}');
    await waitFor(() => expect(focusedDate()).toBe('2025-02-28'));
  });

  it('changes nothing when the year target lies past max', async () => {
    const user = userEvent.setup();
    render(<Calendar defaultValue="2026-06-15" max="2027-01-31" />);
    dayButton('2026-06-15').focus();
    await user.keyboard('{Shift>}{PageDown}{/Shift}');
    expect(focusedDate()).toBe('2026-06-15');
  });
});

describe('date inputs under a provider calendar', () => {
  // Their field text is Gregorian, so their popover calendars stay Gregorian.
  it.each([
    [
      'DateInput',
      <DateInput key="d" label="Date" value="2026-10-30" onChange={() => {}} />,
    ],
    [
      'DateTimeInput',
      <DateTimeInput
        key="dt"
        label="When"
        value={'2026-10-30T09:00' as ISODateTimeString}
        onChange={() => {}}
      />,
    ],
    [
      'DateRangeInput',
      <DateRangeInput
        key="r"
        label="Dates"
        value={{start: '2026-10-30', end: '2026-11-02'}}
        onChange={() => {}}
      />,
    ],
  ])('%s keeps a Gregorian popover calendar', async (_name, field) => {
    const user = userEvent.setup();
    render(
      <InternationalizationProvider locale="en" calendar="persian">
        {field}
      </InternationalizationProvider>,
    );
    await user.click(screen.getByRole('button', {name: 'Open calendar'}));
    // The popover is not shown in jsdom, so the grid is read from the DOM.
    const grid = await waitFor(() => {
      const element = document.querySelector('[role="grid"]');
      expect(element).not.toBeNull();
      return element as HTMLElement;
    });
    expect(grid.getAttribute('aria-label')).toContain('2026');
    expect(grid.getAttribute('aria-label')).not.toContain('1405');
  });
});
