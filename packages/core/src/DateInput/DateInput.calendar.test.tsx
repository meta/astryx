// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DateInput.calendar.test.tsx
 * @input Uses vitest, Testing Library, temporal-polyfill, DateInput
 * @output Typed entry in calendar systems: partial input, digits, Adar,
 *   Japanese eras, rejected dates, bounds, onChange counts, hint, description
 * @position Testing; validates DateInput typed entry with a calendar
 */

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {fireEvent, render, screen, within} from '@testing-library/react';
import {Temporal as TemporalPolyfill} from 'temporal-polyfill/full';
import {DateInput, type DateInputProps} from './DateInput';
import {InternationalizationProvider} from '../i18n/InternationalizationProvider';
import {formatCalendarDateHint} from '../utils/calendarDateParser';
import type {ISODateString} from '../utils/dateTypes';
import {plainDateFromISO} from '../utils/plainDate';

const host = globalThis as {Temporal?: unknown};
const hadTemporal = host.Temporal != null;
beforeAll(() => {
  host.Temporal ??= TemporalPolyfill;
});
afterAll(() => {
  if (!hadTemporal) {
    delete host.Temporal;
  }
});

function renderField(locale: string, props: Partial<DateInputProps> = {}) {
  const onChange = vi.fn();
  const result = render(
    <InternationalizationProvider locale={locale}>
      <DateInput label="Date" onChange={onChange} {...props} />
    </InternationalizationProvider>,
  );
  const input = screen.getByRole('combobox');
  return {...result, input, onChange};
}

/** Types text one character at a time, as a person does. */
function typeSlowly(input: HTMLElement, text: string) {
  let typed = '';
  for (const ch of text) {
    typed += ch;
    fireEvent.change(input, {target: {value: typed}});
  }
}

describe('DateInput typed entry with a calendar', () => {
  it('reports one Persian date typed in Persian digits, only when complete', () => {
    const {input, onChange} = renderField('fa-IR', {calendar: 'persian'});
    typeSlowly(input, '۱۴۰۵/۸/۱۱');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('2026-11-02');
  });

  it('takes the calendar from the provider', () => {
    const onChange = vi.fn();
    render(
      <InternationalizationProvider locale="fa-IR" calendar="persian">
        <DateInput label="Date" onChange={onChange} />
      </InternationalizationProvider>,
    );
    typeSlowly(screen.getByRole('combobox'), '1405/8/11');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-11-02');
  });

  it('writes the committed value in the calendar and keeps ISO values', () => {
    renderField('en', {calendar: 'persian', value: '2026-11-02'});
    expect(screen.getByRole('combobox')).toHaveValue('Aban 11, 1405 AP');
  });

  it('keeps system_date ISO and reads ISO input with it', () => {
    const {input, onChange} = renderField('fa-IR', {
      calendar: 'persian',
      format: 'system_date',
      value: '2026-11-02',
    });
    expect(input).toHaveValue('2026-11-02');
    fireEvent.change(input, {target: {value: '2026-11-03'}});
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-11-03');
  });

  it('reads a plain Adar in a Hebrew leap year as Adar II', () => {
    const {input, onChange} = renderField('en', {calendar: 'hebrew'});
    fireEvent.change(input, {target: {value: '1 Adar 5784'}});
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2024-03-11');
  });

  it('reads Japanese era dates and rejects a year outside its era', () => {
    const {input, onChange, container} = renderField('en', {
      calendar: 'japanese',
    });
    fireEvent.change(input, {target: {value: 'May 1, 1 Reiwa'}});
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2019-05-01');

    fireEvent.change(input, {target: {value: 'May 1, 31 Heisei'}});
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(within(container).getByRole('alert')).toHaveTextContent(
      'This date does not exist in the Japanese Calendar',
    );
  });

  it('rejects a date the calendar does not have and keeps it on blur', () => {
    const {input, onChange, container} = renderField('en', {
      calendar: 'persian',
      value: '2026-11-02',
    });
    fireEvent.change(input, {target: {value: '12/30/1404 AP'}});
    expect(within(container).getByRole('alert')).toHaveTextContent(
      'This date does not exist in the Persian Calendar',
    );
    fireEvent.blur(input);
    expect(input).toHaveValue('12/30/1404 AP');
    expect(input).toHaveAccessibleDescription(
      expect.stringContaining(
        'This date does not exist in the Persian Calendar',
      ),
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows an out-of-range error with the bounds in the calendar', () => {
    const {input, onChange, container} = renderField('en', {
      calendar: 'buddhist',
      min: '2026-01-01',
      max: '2026-12-31',
    });
    // A Gregorian year typed into a Buddhist field is Buddhist year 2026.
    fireEvent.change(input, {target: {value: '11/2/2026'}});
    expect(onChange).not.toHaveBeenCalled();
    expect(within(container).getByRole('alert')).toHaveTextContent(
      'Enter a date from January 1, 2569 BE to December 31, 2569 BE',
    );
    fireEvent.change(input, {target: {value: '11/2/2569'}});
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-11-02');
  });

  it('announces a different message for each kind of rejection', () => {
    const {input, container} = renderField('en', {
      calendar: 'persian',
      max: '2026-12-31',
    });
    const alert = within(container).getByRole('alert');
    const messages = ['abc', '12/30/1404 AP', '1/1/1406 AP'].map(text => {
      fireEvent.change(input, {target: {value: text}});
      return alert.textContent;
    });
    expect(messages).toEqual([
      'Invalid date',
      'This date does not exist in the Persian Calendar',
      'Enter a date on or before Dey 10, 1405 AP',
    ]);
  });

  it('reports nothing for partial input and stays silent while it grows', () => {
    const {input, onChange, container} = renderField('fa-IR', {
      calendar: 'persian',
    });
    for (const text of [
      '۱',
      '۱۴۰۵',
      '۱۴۰۵/',
      '۱۴۰۵/۸',
      '۱۴۰۵/۸/',
      '۱۴۰۵/۸/۱',
    ]) {
      fireEvent.change(input, {target: {value: text}});
      expect(input).not.toHaveAttribute('aria-invalid');
      expect(within(container).getByRole('alert')).toHaveTextContent('');
    }
    expect(onChange).not.toHaveBeenCalled();
  });

  it('commits a partial-looking date on blur', () => {
    const {input, onChange} = renderField('fa-IR', {calendar: 'persian'});
    fireEvent.change(input, {target: {value: '۱۴۰۵/۸/۱'}});
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-10-23');
  });

  it('shows a format hint in the empty focused field', () => {
    const {input} = renderField('en', {calendar: 'persian'});
    expect(input).toHaveAttribute('placeholder', 'Select a date');
    fireEvent.focus(input);
    expect(input.getAttribute('placeholder')).toMatch(
      /^e\.g\., \d+\/\d+\/\d+ AP$/,
    );
    fireEvent.blur(input);
    expect(input).toHaveAttribute('placeholder', 'Select a date');
  });

  describe('format hint example date', () => {
    // 2026-11-07 is a Saturday.
    beforeEach(() => {
      vi.useFakeTimers({toFake: ['Date']});
      vi.setSystemTime(new Date(2026, 10, 7, 12));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    function hintFor(props: Partial<DateInputProps>) {
      const {input} = renderField('en', {calendar: 'persian', ...props});
      fireEvent.focus(input);
      return input.getAttribute('placeholder');
    }
    const hintOf = (iso: ISODateString) =>
      `e.g., ${formatCalendarDateHint(plainDateFromISO(iso), 'en', 'persian')}`;

    it('uses max when max is before today', () => {
      expect(hintFor({max: '2026-03-15'})).toBe(hintOf('2026-03-15'));
    });

    it('uses min when min is after today', () => {
      expect(hintFor({min: '2027-02-01'})).toBe(hintOf('2027-02-01'));
    });

    it('uses the nearest weekday when today is a disabled Saturday', () => {
      expect(
        hintFor({
          dateConstraints: [date => date.getDay() !== 0 && date.getDay() !== 6],
        }),
      ).toBe(hintOf('2026-11-06'));
    });
  });

  it('shows a caller placeholder instead of the format hint', () => {
    const {input} = renderField('en', {
      calendar: 'persian',
      placeholder: 'Pick a day',
    });
    fireEvent.focus(input);
    expect(input).toHaveValue('');
    expect(input).toHaveAttribute('placeholder', 'Pick a day');
  });

  it('opens its calendar in the same calendar', () => {
    const {input} = renderField('en', {
      calendar: 'persian',
      value: '2026-11-02',
    });
    fireEvent.keyDown(input, {key: 'ArrowDown'});
    expect(document.querySelector('[role="grid"]')).toHaveAccessibleName(
      'Aban 1405 AP',
    );
  });

  it('names the calendar in the description', () => {
    const {input} = renderField('en', {calendar: 'hebrew'});
    expect(input).toHaveAccessibleDescription('Dates use the Hebrew Calendar');
  });

  it('names no calendar when the field uses the provider calendar', () => {
    render(
      <InternationalizationProvider locale="fa-IR" calendar="persian">
        <DateInput label="Date" onChange={vi.fn()} />
      </InternationalizationProvider>,
    );
    const input = screen.getByRole('combobox');
    expect(input).not.toHaveAttribute('aria-describedby');
    fireEvent.focus(input);
    expect(input.getAttribute('placeholder')).toMatch(/^e\.g\./);
  });

  it('names the Gregorian calendar inside a Persian provider', () => {
    render(
      <InternationalizationProvider locale="en" calendar="persian">
        <DateInput label="Date" calendar="gregory" onChange={vi.fn()} />
      </InternationalizationProvider>,
    );
    const input = screen.getByRole('combobox');
    expect(input).toHaveAccessibleDescription(
      'Dates use the Gregorian Calendar',
    );
    fireEvent.focus(input);
    expect(input).toHaveAttribute('placeholder', 'Select a date');
  });

  it('names no calendar for an iso8601 field in a Gregorian provider', () => {
    const {input} = renderField('en', {calendar: 'iso8601'});
    expect(input).not.toHaveAttribute('aria-describedby');
  });

  it('names the Persian calendar without a provider calendar', () => {
    const {input} = renderField('en', {calendar: 'persian'});
    expect(input).toHaveAccessibleDescription('Dates use the Persian Calendar');
  });

  it('keeps the Gregorian field free of a hint and a calendar description', () => {
    const {input} = renderField('en');
    fireEvent.focus(input);
    expect(input).toHaveAttribute('placeholder', 'Select a date');
    expect(input).not.toHaveAttribute('aria-describedby');
  });
});

describe('DateInput onChange while typing a Gregorian date', () => {
  it('fires once for a day-first date typed one key at a time', () => {
    const {input, onChange} = renderField('en-GB');
    typeSlowly(input, '12/01/2026');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-01-12');
  });

  it('commits a two-digit year in the locale order on blur', () => {
    const {input, onChange} = renderField('en-GB');
    typeSlowly(input, '12/01/90');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledExactlyOnceWith('1990-01-12');
  });

  it('commits Gregorian text that only parseDateInput reads, on blur only', () => {
    const {input, onChange, container} = renderField('en-US');
    fireEvent.change(input, {target: {value: '2026-01-25 10:00'}});
    expect(onChange).not.toHaveBeenCalled();
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(within(container).getByRole('alert')).toHaveTextContent('');
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-01-25');
  });

  it('commits a day-first date that parseDateInput reads, on Enter only', () => {
    const {input, onChange} = renderField('en-US');
    fireEvent.change(input, {target: {value: '25/1/2026'}});
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(input, {key: 'Enter'});
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-01-25');
  });

  it('commits a day-first date that does not exist month-first, on blur only', () => {
    const {input, onChange} = renderField('en-US');
    typeSlowly(input, '13/5/2026');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-05-13');
  });

  it('commits a month-first date that does not exist day-first, on blur', () => {
    const {input, onChange} = renderField('en-GB');
    fireEvent.change(input, {target: {value: '5/13/2026'}});
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-05-13');
  });

  it.each(['blur', 'Enter'])(
    'keeps a one-digit year on %s and announces it as invalid',
    commit => {
      const {input, onChange, container} = renderField('en-US');
      typeSlowly(input, '1/5/2');
      const alert = within(container).getByRole('alert');
      expect(alert).toHaveTextContent('');
      if (commit === 'blur') {
        fireEvent.blur(input);
      } else {
        fireEvent.keyDown(input, {key: 'Enter'});
      }
      expect(input).toHaveValue('1/5/2');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(alert).toHaveTextContent('Invalid date');
      expect(onChange).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['en-GB', '31/02/2026'],
    ['en-US', '2/30/2026'],
  ])(
    'still rejects a Gregorian date that does not exist in either order (%s %s)',
    (locale, text) => {
      const {input, onChange, container} = renderField(locale);
      fireEvent.change(input, {target: {value: text}});
      fireEvent.blur(input);
      expect(input).toHaveValue(text);
      expect(within(container).getByRole('alert')).toHaveTextContent(
        'This date does not exist in the Gregorian Calendar',
      );
      expect(onChange).not.toHaveBeenCalled();
    },
  );

  it('never reads a date that does not exist in another calendar with parseDateInput', () => {
    const {input, onChange, container} = renderField('en', {
      calendar: 'persian',
    });
    fireEvent.change(input, {target: {value: '13/5/1405 AP'}});
    fireEvent.blur(input);
    expect(input).toHaveValue('13/5/1405 AP');
    expect(within(container).getByRole('alert')).toHaveTextContent(
      'This date does not exist in the Persian Calendar',
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not fire again on blur for a date it already reported', () => {
    const {input, onChange} = renderField('en-US');
    fireEvent.change(input, {target: {value: '11/2/2026'}});
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-11-02');
  });
});
