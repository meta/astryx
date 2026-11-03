// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DateTimeInput.calendar.test.tsx
 * @input Uses vitest, Testing Library, temporal-polyfill, DateTimeInput
 * @output Typed date entry in calendar systems for the DateTimeInput date
 *   field: digits, committed text, rejected dates, onChange counts
 * @position Testing; validates DateTimeInput typed entry with a calendar
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {fireEvent, render, screen, within} from '@testing-library/react';
import {Temporal as TemporalPolyfill} from 'temporal-polyfill/full';
import {
  DateTimeInput,
  type DateTimeInputProps,
  type ISODateTimeString,
} from './DateTimeInput';
import {InternationalizationProvider} from '../i18n/InternationalizationProvider';

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

function renderField(locale: string, props: Partial<DateTimeInputProps> = {}) {
  const onChange = vi.fn();
  const result = render(
    <InternationalizationProvider locale={locale}>
      <DateTimeInput label="Meeting" onChange={onChange} {...props} />
    </InternationalizationProvider>,
  );
  const input = screen.getByRole('combobox');
  return {...result, input, onChange};
}

// A shown status describes the input and announces itself; no alert repeats
// it.
function expectShown(input: HTMLElement, box: HTMLElement, text: string) {
  expect(input).toHaveAccessibleDescription(expect.stringContaining(text));
  const alerts = within(box).getAllByRole('alert');
  expect(alerts.map(alert => alert.textContent)).not.toContain(text);
}

function typeSlowly(input: HTMLElement, text: string) {
  let typed = '';
  for (const ch of text) {
    typed += ch;
    fireEvent.change(input, {target: {value: typed}});
  }
}

describe('DateTimeInput typed date entry with a calendar', () => {
  it('reports one Persian date typed in Persian digits, only when complete', () => {
    const {input, onChange} = renderField('fa-IR', {calendar: 'persian'});
    typeSlowly(input, '۱۴۰۵/۸/۱۱');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatch(/^2026-11-02T/);
  });

  it('writes the committed date in the calendar', () => {
    renderField('en', {
      calendar: 'hebrew',
      value: '2024-03-11T09:30' as ISODateTimeString,
    });
    expect(screen.getByRole('combobox')).toHaveValue('1 Adar II 5784 AM');
  });

  it('rejects a date the calendar does not have and names the calendar', () => {
    const {input, onChange, container} = renderField('en', {
      calendar: 'hebrew',
    });
    fireEvent.change(input, {target: {value: '1 Adar I 5785'}});
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expectShown(
      input,
      container,
      'This date does not exist in the Hebrew Calendar',
    );
    fireEvent.blur(input);
    expect(input).toHaveValue('1 Adar I 5785');
  });

  it('shows an out-of-range error with the bounds in the calendar', () => {
    const {input, onChange, container} = renderField('en', {
      calendar: 'japanese',
      min: '2019-05-01T00:00' as ISODateTimeString,
    });
    fireEvent.change(input, {target: {value: 'April 30, 31 Heisei'}});
    expect(onChange).not.toHaveBeenCalled();
    expectShown(input, container, 'Enter a date on or after May 1, 1 Reiwa');
  });

  it('names the calendar and shows the hint when focused and empty', () => {
    const {input} = renderField('en', {calendar: 'persian'});
    expect(input).toHaveAccessibleDescription('Dates use the Persian Calendar');
    fireEvent.focus(input);
    expect(input.getAttribute('placeholder')).toMatch(/^e\.g\., .+ AP$/);
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

  it('names no calendar when the field uses the provider calendar', () => {
    render(
      <InternationalizationProvider locale="fa-IR" calendar="persian">
        <DateTimeInput label="Meeting" onChange={vi.fn()} />
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
        <DateTimeInput label="Meeting" calendar="gregory" onChange={vi.fn()} />
      </InternationalizationProvider>,
    );
    expect(screen.getByRole('combobox')).toHaveAccessibleDescription(
      'Dates use the Gregorian Calendar',
    );
  });

  it('commits Gregorian text that only parseDateInput reads on blur', () => {
    const {input, onChange} = renderField('en-US');
    fireEvent.change(input, {target: {value: '2026-01-25 10:00'}});
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatch(/^2026-01-25T/);
  });

  it('commits a day-first date that does not exist month-first, on blur only', () => {
    const {input, onChange} = renderField('en-US');
    typeSlowly(input, '13/5/2026');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatch(/^2026-05-13T/);
  });

  it('fires once for a day-first Gregorian date typed one key at a time', () => {
    const {input, onChange} = renderField('en-GB');
    typeSlowly(input, '12/01/2026');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatch(/^2026-01-12T/);
  });
});
