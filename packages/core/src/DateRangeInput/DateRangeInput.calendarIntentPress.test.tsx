// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DateRangeInput.calendarIntentPress.test.tsx
 * @input vitest (jsdom), Testing Library, DateRangeInput with its Calendar
 *   module counted
 * @output Tests that a pointer down on the trigger starts loading the Calendar
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

async function settle() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 20));
  });
}

describe('DateRangeInput Calendar intent', () => {
  it('starts the load on a pointer down', async () => {
    render(<DateRangeInput value={null} onChange={() => {}} label="Stay" />);
    const control = document.querySelector<HTMLElement>(
      'button[aria-haspopup="dialog"]:not([tabindex="-1"])',
    );
    if (control == null) {
      throw new Error('no range trigger');
    }
    await settle();
    expect(calendarImport.calls).toBe(0);
    fireEvent.pointerDown(control, {pointerType: 'touch'});
    await settle();
    expect(calendarImport.calls).toBe(1);
  });
});
