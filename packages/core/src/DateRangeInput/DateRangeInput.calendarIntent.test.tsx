// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DateRangeInput.calendarIntent.test.tsx
 * @input vitest (jsdom), Testing Library, DateRangeInput with its Calendar
 *   module counted
 * @output Tests which intents on the trigger start loading the Calendar
 * @position Testing for DateRangeCalendar.tsx
 */

import {act, fireEvent, render} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

const calendarImport = vi.hoisted(() => ({calls: 0}));

vi.mock('../Calendar/Calendar', async importOriginal => {
  calendarImport.calls += 1;
  return importOriginal();
});

import {DateRangeInput} from './DateRangeInput';

const noop = () => {};

async function settle() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 20));
  });
}

describe('DateRangeInput Calendar intent', () => {
  it('does not start the load on a touch entry, and starts it on focus', async () => {
    render(<DateRangeInput value={null} onChange={noop} label="Stay" />);
    const control = document.querySelector<HTMLElement>(
      'button[aria-haspopup="dialog"]:not([tabindex="-1"])',
    );
    if (control?.parentElement == null) {
      throw new Error('no range trigger');
    }
    // A touch reports its own pointer down, which starts the load.
    fireEvent.pointerEnter(control.parentElement, {pointerType: 'touch'});
    await settle();
    expect(calendarImport.calls).toBe(0);

    act(() => {
      control.focus();
    });
    await settle();
    expect(calendarImport.calls).toBe(1);
  });
});
