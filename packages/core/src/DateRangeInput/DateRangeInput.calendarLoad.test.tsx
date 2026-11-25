// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DateRangeInput.calendarLoad.test.tsx
 * @input vitest (jsdom), Testing Library, DateRangeInput with its Calendar
 *   module counted
 * @output Tests that the Calendar loads on the trigger's first intent, not
 *   with the field, and that the first open shows the popover only with its
 *   Calendar
 * @position Testing for DateRangeCalendar.tsx
 */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

const calendarImport = vi.hoisted(() => ({calls: 0}));

vi.mock('../Calendar/Calendar', async importOriginal => {
  calendarImport.calls += 1;
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

describe('DateRangeInput Calendar loading', () => {
  it('loads the Calendar on the first open, not with the field, opens the popover only with it, and opens at once after', async () => {
    render(<DateRangeInput value={null} onChange={noop} label="Stay" />);
    await settle();
    expect(calendarImport.calls).toBe(0);

    // A click with no pointer down or focus before it, so the open itself
    // asks for the Calendar.
    act(() => {
      fireEvent.click(trigger());
    });
    // No popover without its Calendar.
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).toBeNull();

    // A cold import in jsdom takes seconds.
    await waitFor(
      () => expect(trigger()).toHaveAttribute('aria-expanded', 'true'),
      {timeout: 15000},
    );
    expect(calendarImport.calls).toBe(1);
    expect(
      // The popover layer is outside jsdom's accessibility tree.
      screen.getByRole('button', {name: 'Previous month', hidden: true}),
    ).toBeInTheDocument();
    cleanup();

    // With Calendar loaded, another field opens at once and loads nothing
    // more. One case, so a shuffled run keeps the order.
    render(<DateRangeInput value={null} onChange={noop} label="Stay" />);
    fireEvent.pointerEnter(trigger().parentElement as HTMLElement, {
      pointerType: 'mouse',
    });
    act(() => {
      fireEvent.click(trigger());
    });
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(calendarImport.calls).toBe(1);
  }, 20000);
});
