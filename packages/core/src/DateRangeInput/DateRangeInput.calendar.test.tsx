// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DateRangeInput.calendar.test.tsx
 * @input Uses vitest, Testing Library, temporal-polyfill, DateRangeInput
 * @output The range in a calendar: trigger text, the popover Calendar,
 *   Gregorian ISO values, and the fallback without Temporal
 * @position Colocated test for DateRangeInput's `calendar` prop
 */

import {afterAll, afterEach, beforeAll, beforeEach} from 'vitest';
import {describe, expect, it, vi} from 'vitest';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {Temporal as TemporalPolyfill} from 'temporal-polyfill/full';
import {DateRangeInput, type DateRangeInputProps} from './DateRangeInput';
import {InternationalizationProvider} from '../i18n/InternationalizationProvider';
import {__resetDevWarnings} from '../utils/devWarning';

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

beforeEach(() => {
  vi.useFakeTimers({toFake: ['Date']});
  vi.setSystemTime(new Date(2026, 10, 2, 12));
  __resetDevWarnings();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderRange(
  locale: string,
  props: Partial<DateRangeInputProps>,
  providerCalendar?: 'persian',
) {
  const onChange = vi.fn();
  render(
    <InternationalizationProvider locale={locale} calendar={providerCalendar}>
      <DateRangeInput
        label="Stay"
        value={{start: '2026-10-30', end: '2026-11-02'}}
        onChange={onChange}
        {...props}
      />
    </InternationalizationProvider>,
  );
  return {onChange};
}

/** The range trigger: the button that shows the range. */
function triggerText(): string {
  return (
    document.querySelector<HTMLElement>(
      'button[aria-haspopup="dialog"]:not([tabindex="-1"])',
    )?.textContent ?? ''
  );
}

describe('DateRangeInput in a calendar', () => {
  it('writes the trigger text in the Persian calendar', () => {
    renderRange('en', {calendar: 'persian'});
    expect(triggerText()).toContain('Aban 8 – Aban 11');
  });

  it('takes the calendar from the provider', () => {
    renderRange('fa-IR', {}, 'persian');
    expect(triggerText()).toContain('۸ آبان – ۱۱ آبان');
  });

  it('shows the year when the range leaves the current calendar year', () => {
    // Both dates are in Gregorian 2026, but Nowruz falls between them.
    renderRange('en', {
      calendar: 'persian',
      value: {start: '2026-03-15', end: '2026-03-25'},
    });
    expect(triggerText()).toContain('Esfand 24, 1404 AP');
    expect(triggerText()).toContain('Farvardin 5, 1405 AP');
  });

  it('opens a Persian popover calendar and reports Gregorian ISO dates', async () => {
    const {onChange} = renderRange('en', {calendar: 'persian', value: null});
    fireEvent.click(screen.getByRole('button', {name: 'Open calendar'}));
    const grid = await waitFor(() => {
      const element = document.querySelector('[role="grid"]');
      expect(element).not.toBeNull();
      return element as HTMLElement;
    });
    expect(grid.getAttribute('aria-label')).toContain('1405');
    const first = grid.querySelector<HTMLButtonElement>(
      'button[data-date="2026-10-23"]',
    );
    const last = grid.querySelector<HTMLButtonElement>(
      'button[data-date="2026-10-25"]',
    );
    fireEvent.click(first!);
    fireEvent.click(last!);
    expect(onChange).toHaveBeenLastCalledWith({
      start: '2026-10-23',
      end: '2026-10-25',
    });
  });

  it('keeps Gregorian text by default', () => {
    renderRange('en', {});
    expect(triggerText()).toContain('Oct 30 – Nov 2');
  });

  it('writes Buddhist years', () => {
    renderRange('th-TH', {
      calendar: 'buddhist',
      value: {start: '2025-12-30', end: '2026-01-02'},
    });
    expect(triggerText()).toContain('2568');
    expect(triggerText()).toContain('2569');
  });
});

describe('DateRangeInput in a calendar without Temporal', () => {
  const saved = host.Temporal;
  beforeEach(() => {
    delete host.Temporal;
  });
  afterEach(() => {
    host.Temporal = saved;
  });

  it('shows Gregorian dates for Persian and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderRange('en', {calendar: 'persian'});
    expect(triggerText()).toContain('Oct 30 – Nov 2');
    expect(String(warn.mock.calls[0]?.[0])).toContain(
      'needs a Temporal that supports it',
    );
  });

  it('still writes Buddhist years', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderRange('th-TH', {
      calendar: 'buddhist',
      value: {start: '2025-12-30', end: '2026-01-02'},
    });
    expect(triggerText()).toContain('2569');
    expect(warn).not.toHaveBeenCalled();
  });
});
