// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DateInput.noTemporal.test.tsx
 * @input Uses vitest, Testing Library, DateInput, DateTimeInput; no Temporal
 * @output Presentations without Temporal: a calendar that needs it falls back
 *   to Gregorian, with the native control and a warning, while Buddhist and
 *   Japanese still show their years in the bottom sheet
 * @position Testing; validates the runtime without Temporal, such as Safari
 */

import {afterAll, afterEach, beforeAll, beforeEach} from 'vitest';
import {describe, expect, it, vi, type MockInstance} from 'vitest';
import {fireEvent, render, screen, within} from '@testing-library/react';
import {DateInput, type DateInputProps} from './DateInput';
import {
  DateTimeInput,
  type ISODateTimeString,
} from '../DateTimeInput/DateTimeInput';
import {InternationalizationProvider} from '../i18n/InternationalizationProvider';
import {resetDateSegmentProbe} from './nativeDateSegments';
import {__resetDevWarnings} from '../utils/devWarning';

const host = globalThis as {Temporal?: unknown};
const saved = host.Temporal;

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

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

function withLayout<T>(fn: () => T): T {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.dataset?.scroller === 'months' ? 360 : 0;
    },
  });
  try {
    return fn();
  } finally {
    delete (HTMLElement.prototype as {clientWidth?: unknown}).clientWidth;
  }
}

beforeAll(() => {
  delete host.Temporal;
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
  if (saved != null) {
    host.Temporal = saved;
  }
});

beforeEach(() => {
  __resetDevWarnings();
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  stubCoarsePointer();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetDateSegmentProbe();
});

type WarnSpy = MockInstance<typeof console.warn>;

function warnings(): WarnSpy {
  return vi.spyOn(console, 'warn').mockImplementation(() => {});
}

function messages(warn: WarnSpy): string[] {
  return warn.mock.calls.map(([message]) => String(message));
}

function renderField(locale: string, props: Partial<DateInputProps>) {
  return withLayout(() =>
    render(
      <InternationalizationProvider locale={locale}>
        <DateInput label="Date" onChange={() => {}} {...props} />
      </InternationalizationProvider>,
    ),
  );
}

describe('presentations without Temporal', () => {
  it('runs without Temporal', () => {
    expect(host.Temporal).toBeUndefined();
  });

  it('shows a Persian field as a Gregorian native control and warns', () => {
    const warn = warnings();
    renderField('en', {calendar: 'persian', value: '2026-11-02'});
    expect(document.querySelector('input[type="date"]')).not.toBeNull();
    const all = messages(warn);
    expect(all.some(m => m.includes('needs a Temporal'))).toBe(true);
    expect(all.some(m => m.includes('presentation="native"'))).toBe(false);
  });

  it('keeps an explicit native native, because the calendar fell back', () => {
    const warn = warnings();
    renderField('en', {
      calendar: 'persian',
      presentation: 'native',
      value: '2026-11-02',
    });
    expect(document.querySelector('input[type="date"]')).not.toBeNull();
    expect(messages(warn).some(m => m.includes('presentation="native"'))).toBe(
      false,
    );
  });

  it('shows Gregorian months in a Persian bottom sheet', () => {
    warnings();
    renderField('en', {
      calendar: 'persian',
      presentation: 'bottom-sheet',
      value: '2026-11-02',
      min: '2026-10-01',
      max: '2026-12-31',
    });
    withLayout(() => fireEvent.click(screen.getByRole('combobox')));
    expect(screen.getByRole('combobox')).toHaveValue('November 2, 2026');
    expect(
      document.querySelector('[data-title="month-year"]'),
    ).toHaveTextContent('November 2026');
  });

  it('shows Buddhist years in the bottom sheet a coarse pointer gets', () => {
    const warn = warnings();
    renderField('th-TH', {
      calendar: 'buddhist',
      value: '2026-11-02',
      min: '2025-01-01',
      max: '2026-12-31',
    });
    expect(document.querySelector('input[type="date"]')).toBeNull();
    expect(screen.getByRole('combobox')).toHaveAttribute('inputmode', 'none');
    expect(screen.getByRole<HTMLInputElement>('combobox').value).toContain(
      '2569',
    );
    withLayout(() => fireEvent.click(screen.getByRole('combobox')));
    expect(
      document.querySelector('[data-title="month-year"]'),
    ).toHaveTextContent('2569');
    expect(warn).not.toHaveBeenCalled();
  });

  it('labels Japanese years with their era', () => {
    const warn = warnings();
    renderField('ja-JP', {
      calendar: 'japanese',
      value: '2026-11-02',
      min: '2025-01-01',
      max: '2026-12-31',
    });
    withLayout(() => fireEvent.click(screen.getByRole('combobox')));
    withLayout(() =>
      fireEvent.click(
        document.querySelector<HTMLElement>('[data-title="month-year"]')!,
      ),
    );
    const years = within(screen.getByRole('listbox', {name: 'Year'}))
      .getAllByRole('option')
      .map(option => option.textContent);
    expect(years).toEqual(['令和7', '令和8']);
    expect(warn).not.toHaveBeenCalled();
  });

  it('shows a Persian DateTimeInput as Gregorian native controls', () => {
    warnings();
    render(
      <DateTimeInput
        label="When"
        calendar="persian"
        value={'2026-11-02T09:00' as ISODateTimeString}
        onChange={() => {}}
      />,
    );
    expect(document.querySelector('input[type="date"]')).not.toBeNull();
  });
});
