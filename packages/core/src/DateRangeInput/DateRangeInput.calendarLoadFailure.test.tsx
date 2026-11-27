// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DateRangeInput.calendarLoadFailure.test.tsx
 * @input vitest (jsdom), Testing Library, DateRangeInput with its Calendar
 *   module mocked to fail once
 * @output Tests that a failed Calendar load leaves the field working and
 *   closed, warns once, and that the next open loads the Calendar
 * @position Testing for DateRangeCalendar.tsx
 */

import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

const calendarImport = vi.hoisted(() => ({failures: 1, calls: 0}));

vi.mock('../Calendar/Calendar', async importOriginal => {
  calendarImport.calls += 1;
  if (calendarImport.failures > 0) {
    calendarImport.failures -= 1;
    throw new TypeError('Failed to fetch dynamically imported module');
  }
  return importOriginal();
});

import {DateRangeInput} from './DateRangeInput';

const noop = () => {};

function trigger(): HTMLElement {
  const el = document.querySelector<HTMLElement>(
    'button[aria-haspopup="dialog"]:not([tabindex="-1"])',
  );
  if (el == null) {
    throw new Error('no range trigger');
  }
  return el;
}

async function settle() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 20));
  });
}

describe('DateRangeInput Calendar that fails to load', () => {
  it('keeps the field closed and working, warns once; a later open asks the loader again', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<DateRangeInput value={null} onChange={noop} label="Stay" />);
    act(() => {
      fireEvent.click(trigger());
    });
    await settle();
    expect(calendarImport.calls).toBe(1);
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger()).toBeInTheDocument();
    expect(
      warn.mock.calls.filter(([message]) =>
        String(message).includes('The calendar could not load'),
      ),
    ).toHaveLength(1);

    act(() => {
      fireEvent.click(trigger());
    });
    // A cold import in jsdom takes seconds.
    await waitFor(
      () => expect(trigger()).toHaveAttribute('aria-expanded', 'true'),
      {timeout: 15000},
    );
    expect(calendarImport.calls).toBe(2);
    expect(
      // The popover layer is outside jsdom's accessibility tree.
      screen.getByRole('button', {name: 'Previous month', hidden: true}),
    ).toBeInTheDocument();
    warn.mockRestore();
  }, 20000);
});
