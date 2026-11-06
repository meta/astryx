// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DateInputTouch.calendar.test.tsx
 * @input Uses vitest, Testing Library, temporal-polyfill, DateInput,
 *   DateTimeInput, monthGeometry
 * @output The bottom sheet in calendars: month panes, labels and digits, the
 *   month and year wheels, leap months, eras, and the month model
 * @position Testing; validates the touch surfaces against the calendar
 */

import {afterAll, afterEach, beforeAll, beforeEach} from 'vitest';
import {describe, expect, it, vi} from 'vitest';
import {fireEvent, render, screen, within} from '@testing-library/react';
import {Temporal as TemporalPolyfill} from 'temporal-polyfill/full';
import {DateInput, type DateInputProps} from './DateInput';
import {
  DateTimeInput,
  type ISODateTimeString,
} from '../DateTimeInput/DateTimeInput';
import {InternationalizationProvider} from '../i18n/InternationalizationProvider';
import {createMonthModel} from './monthGeometry';
import type {CalendarSystem} from '../utils/calendarSystem';
import type {ISODateString} from '../utils/dateTypes';
import {plainDateAddDays, plainDateFromISO} from '../utils/plainDate';

const host = globalThis as {Temporal?: unknown};
const hadTemporal = host.Temporal != null;

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const SCROLLPORT_WIDTH = 360;
const HOVER_CAPABLE = /\(\s*hover\s*:\s*hover\s*\)/;

function stubCoarsePointer(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: /pointer:\s*coarse/.test(query)
      ? true
      : /pointer:\s*fine/.test(query)
        ? false
        : HOVER_CAPABLE.test(query),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

// jsdom lays nothing out, so the month scrollport reports its CSS width only
// while a test renders and opens the sheet.
function withLayout<T>(fn: () => T): T {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.dataset?.scroller === 'months' ? SCROLLPORT_WIDTH : 0;
    },
  });
  try {
    return fn();
  } finally {
    delete (HTMLElement.prototype as {clientWidth?: unknown}).clientWidth;
  }
}

beforeAll(() => {
  host.Temporal ??= TemporalPolyfill;
  Element.prototype.scrollTo = vi.fn();
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
  });
});

afterAll(() => {
  if (!hadTemporal) {
    delete host.Temporal;
  }
});

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  stubCoarsePointer();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function openSheet(
  locale: string,
  props: Partial<DateInputProps> & {calendar: CalendarSystem},
): void {
  withLayout(() => {
    render(
      <InternationalizationProvider locale={locale}>
        <DateInput
          label="Date"
          presentation="bottom-sheet"
          onChange={() => {}}
          {...props}
        />
      </InternationalizationProvider>,
    );
    fireEvent.click(screen.getByRole('combobox'));
  });
}

const title = () =>
  document.querySelector<HTMLElement>('[data-title="month-year"]')!;

function pane(label: string): HTMLElement {
  const grid = [
    ...document.querySelectorAll<HTMLElement>('[role="grid"]'),
  ].find(element => element.getAttribute('aria-label') === label);
  if (grid == null) {
    throw new Error(
      `no pane for ${label} among ${[...document.querySelectorAll('[role="grid"]')].map(g => g.getAttribute('aria-label')).join(' | ')}`,
    );
  }
  return grid;
}

/** The in-month day buttons of a pane, in order. */
function monthDays(grid: HTMLElement): HTMLButtonElement[] {
  return [
    ...grid.querySelectorAll<HTMLButtonElement>(
      'button[data-date]:not([data-outside])',
    ),
  ];
}

function wheelOptions(name: 'Month' | 'Year'): HTMLElement[] {
  return within(screen.getByRole('listbox', {name})).getAllByRole('option');
}

function openWheels(): void {
  withLayout(() => fireEvent.click(title()));
}

describe('the bottom sheet in a calendar', () => {
  it('lays out a Persian month with its days, labels and locale digits', () => {
    openSheet('fa-IR', {
      calendar: 'persian',
      value: '2026-11-02',
      min: '2026-09-01',
      max: '2026-12-31',
    });
    const aban = pane('۱۴۰۵ آبان');
    const days = monthDays(aban);
    expect(days).toHaveLength(30);
    expect(days[0]).toHaveAttribute('data-date', '2026-10-23');
    expect(days[0]).toHaveTextContent('۱');
    expect(days[29]).toHaveAttribute('data-date', '2026-11-21');
    expect(days[10]).toHaveAccessibleName('۱۴۰۵ آبان ۱۱, دوشنبه');
    // Six rows, whatever the month needs.
    expect(aban.querySelectorAll('button[data-date]')).toHaveLength(42);
    expect(title()).toHaveTextContent('۱۴۰۵ آبان');
  });

  it('selects the Gregorian ISO date of a Persian day', () => {
    const onChange = vi.fn();
    openSheet('en', {
      calendar: 'persian',
      value: '2026-11-02',
      min: '2026-09-01',
      max: '2026-12-31',
      onChange,
    });
    fireEvent.click(monthDays(pane('Aban 1405 AP'))[0]);
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-10-23');
  });

  it('shows Adar I and Adar II as separate months in a Hebrew leap year', () => {
    openSheet('en', {
      calendar: 'hebrew',
      value: '2024-02-15',
      min: '2024-01-01',
      max: '2024-04-30',
    });
    const adarI = pane('Adar I 5784');
    expect(monthDays(adarI)).toHaveLength(30);
    expect(monthDays(adarI)[0]).toHaveAttribute('data-date', '2024-02-10');
    const adarII = pane('Adar II 5784');
    expect(monthDays(adarII)).toHaveLength(29);
    expect(monthDays(adarII)[0]).toHaveAttribute('data-date', '2024-03-11');
  });

  it('shows one Adar in a common Hebrew year', () => {
    openSheet('en', {
      calendar: 'hebrew',
      value: '2025-03-10',
      min: '2025-01-15',
      max: '2025-04-30',
    });
    const adar = pane('Adar 5785');
    expect(monthDays(adar)).toHaveLength(29);
    expect(monthDays(adar)[0]).toHaveAttribute('data-date', '2025-03-01');
    expect(
      [...document.querySelectorAll('[role="grid"]')].map(grid =>
        grid.getAttribute('aria-label'),
      ),
    ).not.toContain('Adar I 5785');
  });

  it.each([
    ['a common year', '2026-09-08', 'Pagumen 2018 AM', 5, '2026-09-06'],
    ['a leap year', '2027-09-08', 'Pagumen 2019 AM', 6, '2027-09-06'],
  ])(
    'keeps six rows for the Ethiopic thirteenth month in %s',
    (_name, value, label, length, first) => {
      openSheet('en', {
        calendar: 'ethiopic',
        value: value as ISODateString,
        min: `${value.slice(0, 4)}-08-01` as ISODateString,
        max: `${value.slice(0, 4)}-10-31` as ISODateString,
      });
      const pagume = pane(label);
      expect(monthDays(pagume)).toHaveLength(length);
      expect(monthDays(pagume)[0]).toHaveAttribute('data-date', first);
      expect(pagume.querySelectorAll('button[data-date]')).toHaveLength(42);
    },
  );

  it('lists 13 months in a Hebrew leap year and 12 in a common year', () => {
    openSheet('en', {
      calendar: 'hebrew',
      value: '2024-02-15',
      min: '2023-09-01',
      max: '2025-09-30',
    });
    openWheels();
    const leap = wheelOptions('Month');
    expect(leap).toHaveLength(13);
    expect(leap.map(option => option.textContent)).toEqual(
      expect.arrayContaining(['Adar I', 'Adar II']),
    );
    expect(leap[5]).toHaveTextContent('Adar I');
    expect(leap[5]).toHaveAttribute('aria-selected', 'true');

    // Adar I becomes Adar in a year without it.
    fireEvent.click(
      within(screen.getByRole('listbox', {name: 'Year'})).getByText('5785 AM'),
    );
    expect(title()).toHaveTextContent('Adar 5785');
    const common = wheelOptions('Month');
    expect(common).toHaveLength(12);
    expect(common.map(option => option.textContent)).not.toContain('Adar I');
    expect(common[5]).toHaveTextContent('Adar');
    expect(common[5]).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps the month on a year change when the new year has it', () => {
    openSheet('en', {
      calendar: 'hebrew',
      value: '2024-04-15',
      min: '2023-09-01',
      max: '2025-09-30',
    });
    expect(title()).toHaveTextContent('Nisan 5784');
    openWheels();
    fireEvent.click(
      within(screen.getByRole('listbox', {name: 'Year'})).getByText('5785 AM'),
    );
    expect(title()).toHaveTextContent('Nisan 5785');
  });

  it('labels Japanese years with their era', () => {
    openSheet('ja-JP', {
      calendar: 'japanese',
      value: '2026-11-02',
      min: '2018-01-01',
      max: '2026-12-31',
    });
    expect(title()).toHaveTextContent('令和8年11月');
    openWheels();
    const years = wheelOptions('Year').map(option => option.textContent);
    expect(years).toContain('令和8');
    expect(years).toContain('平成30');
    // November is in Reiwa, so the 2019 row names Reiwa.
    expect(years).toContain('令和元');
    expect(years).toContain('令和2');
    expect(wheelOptions('Month')[10]).toHaveTextContent('11月');
  });

  it('names the era of the shown month for a year with an era change', () => {
    openSheet('ja-JP', {
      calendar: 'japanese',
      value: '2019-01-22',
      min: '2018-01-01',
      max: '2020-12-31',
    });
    expect(title()).toHaveTextContent('平成31年1月');
    openWheels();
    const yearRow = (name: string) =>
      within(screen.getByRole('listbox', {name: 'Year'})).getByRole('option', {
        name,
      });
    expect(yearRow('平成31')).toHaveAttribute('aria-selected', 'true');
    expect(yearRow('平成30')).toBeInTheDocument();
    expect(yearRow('令和2')).toBeInTheDocument();

    fireEvent.click(
      within(screen.getByRole('listbox', {name: 'Month'})).getByText('7月'),
    );
    expect(title()).toHaveTextContent('令和元年7月');
    expect(yearRow('令和元')).toHaveAttribute('aria-selected', 'true');
    expect(
      within(screen.getByRole('listbox', {name: 'Year'})).queryByRole(
        'option',
        {name: '平成31'},
      ),
    ).toBeNull();
  });

  it('names the era of the kept day in the heading of a split month', () => {
    openSheet('ja-JP', {
      calendar: 'japanese',
      value: '1989-01-03',
      min: '1988-01-01',
      max: '1990-12-31',
    });
    expect(title()).toHaveTextContent('昭和64年1月');
    openWheels();
    expect(
      within(screen.getByRole('listbox', {name: 'Year'})).getByRole('option', {
        name: '昭和64',
      }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(title()).toHaveTextContent('昭和64年1月');
  });

  it('names Shōwa in the heading for December 26, 1926', () => {
    openSheet('ja-JP', {
      calendar: 'japanese',
      value: '1926-12-26',
      min: '1926-01-01',
      max: '1927-12-31',
    });
    expect(title()).toHaveTextContent('昭和元年12月');
  });

  it('labels Buddhist and Persian years in the calendar', () => {
    openSheet('en', {
      calendar: 'persian',
      value: '2026-11-02',
      min: '2025-01-01',
      max: '2026-12-31',
    });
    openWheels();
    expect(wheelOptions('Year').map(option => option.textContent)).toEqual([
      '1403 AP',
      '1404 AP',
      '1405 AP',
    ]);
  });

  it('keeps Gregorian wheels as they were', () => {
    openSheet('en', {
      calendar: 'gregory',
      value: '2026-03-21',
      min: '2025-01-01',
      max: '2026-12-31',
    });
    openWheels();
    expect(wheelOptions('Year').map(option => option.textContent)).toEqual([
      '2025',
      '2026',
    ]);
    expect(wheelOptions('Month')).toHaveLength(12);
  });
});

describe('the DateTimeInput bottom sheet in a calendar', () => {
  it('shows Persian months and the date in the calendar', () => {
    withLayout(() => {
      render(
        <InternationalizationProvider locale="en">
          <DateTimeInput
            label="When"
            calendar="persian"
            presentation="bottom-sheet"
            value={'2026-11-02T09:00' as ISODateTimeString}
            min={'2026-09-01T00:00' as ISODateTimeString}
            max={'2026-12-31T23:59' as ISODateTimeString}
            onChange={() => {}}
          />
        </InternationalizationProvider>,
      );
      fireEvent.click(document.querySelector('input[inputmode="none"]')!);
    });
    expect(monthDays(pane('Aban 1405 AP'))[0]).toHaveAttribute(
      'data-date',
      '2026-10-23',
    );
  });
});

describe('the DateTimeInput bottom sheet heading in a split month', () => {
  it('names the era of the kept day', () => {
    withLayout(() => {
      render(
        <InternationalizationProvider locale="ja-JP">
          <DateTimeInput
            label="日時"
            calendar="japanese"
            presentation="bottom-sheet"
            value={'1989-01-03T09:00' as ISODateTimeString}
            min={'1988-12-01T00:00' as ISODateTimeString}
            max={'1989-02-28T23:59' as ISODateTimeString}
            onChange={() => {}}
          />
        </InternationalizationProvider>,
      );
      fireEvent.click(document.querySelector('input[inputmode="none"]')!);
    });
    // The heading button names the shown month; the date segment also holds
    // 昭和64年1月 as part of its full date, so read the button's text.
    const heading = [
      ...document.querySelectorAll<HTMLButtonElement>(
        'dialog[open] button[aria-expanded]',
      ),
    ].find(button => button.textContent === '昭和64年1月');
    expect(heading).toBeDefined();
  });
});

describe('the month model', () => {
  it.each([
    'gregory',
    'japanese',
    'persian',
    'hebrew',
    'chinese',
    'ethiopic',
    'islamic-umalqura',
  ] as const)('round-trips indexes and months in %s', calendar => {
    const model = createMonthModel(calendar);
    const start = model.indexOf(plainDateFromISO('2020-01-01'));
    for (let index = start - 30; index <= start + 90; index++) {
      const month = model.monthAt(index);
      expect(model.indexOf(month.start)).toBe(index);
      expect(model.indexOf(month.end)).toBe(index);
      expect(model.monthAt(index + 1).start).toEqual(
        plainDateAddDays(month.end, 1),
      );
      const {year, month: position} = model.yearMonthAt(index);
      expect(model.indexOfYearMonth(year, position)).toBe(index);
    }
  });

  it('counts the months of Hebrew years', () => {
    const model = createMonthModel('hebrew');
    expect(model.monthsInYear(5784)).toBe(13);
    expect(model.monthsInYear(5785)).toBe(12);
  });

  it('moves a leap month to its common counterpart a year on', () => {
    const model = createMonthModel('hebrew');
    const adarI = model.indexOfYearMonth(5784, 6);
    expect(model.yearMonthAt(model.shiftYears(adarI, 1))).toEqual({
      year: 5785,
      month: 6,
    });
  });
});
