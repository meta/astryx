// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DateRangeInput.calendarHold.test.tsx
 * @input vitest (jsdom), Testing Library, DateRangeInput with its Calendar
 *   host mocked so each case controls when the load lands
 * @output Tests the open held while Calendar loads: another press keeps it
 *   and the field opens once; a press elsewhere, focus leaving the field,
 *   Escape, a disabled field and an unmount drop it
 * @position Testing for DateRangeInput.tsx
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';

// One load runs at a time, as with the shared module loader: every call
// while it runs gets the same promise.
const calendarLoad = vi.hoisted(() => ({
  isLoaded: false,
  loads: 0,
  pending: null as Promise<boolean> | null,
  finish: (_isLoaded: boolean) => {},
}));

vi.mock('./DateRangeCalendar', () => ({
  isDateRangeCalendarLoaded: () => calendarLoad.isLoaded,
  loadDateRangeCalendar: async () => {
    if (calendarLoad.pending == null) {
      calendarLoad.loads += 1;
      calendarLoad.pending = new Promise<boolean>(resolve => {
        calendarLoad.finish = isLoaded => {
          calendarLoad.isLoaded = isLoaded;
          calendarLoad.pending = null;
          resolve(isLoaded);
        };
      });
    }
    return calendarLoad.pending;
  },
  DateRangeCalendar: () => <div data-testid="range-calendar" />,
}));

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

async function finishLoad(isLoaded = true) {
  await act(async () => {
    calendarLoad.finish(isLoaded);
    await Promise.resolve();
  });
}

beforeEach(() => {
  calendarLoad.isLoaded = false;
  calendarLoad.loads = 0;
  calendarLoad.pending = null;
});

describe('DateRangeInput open held while Calendar loads', () => {
  it('keeps the held open on a second press and opens once when Calendar loads', async () => {
    render(<DateRangeInput value={null} onChange={noop} label="Stay" />);
    for (let press = 0; press < 2; press++) {
      fireEvent.pointerDown(trigger());
      fireEvent.pointerUp(trigger());
      fireEvent.click(trigger());
    }
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    await finishLoad();
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByTestId('range-calendar')).toHaveLength(1);
  });

  it('drops the held open on a press outside the field', async () => {
    render(
      <>
        <DateRangeInput value={null} onChange={noop} label="Stay" />
        <button type="button">Elsewhere</button>
      </>,
    );
    fireEvent.click(trigger());
    const elsewhere = screen.getByRole('button', {name: 'Elsewhere'});
    fireEvent.pointerDown(elsewhere);
    fireEvent.pointerUp(elsewhere);
    await finishLoad();
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps the held open on a press inside the field', async () => {
    render(<DateRangeInput value={null} onChange={noop} label="Stay" />);
    fireEvent.click(trigger());
    fireEvent.pointerDown(trigger());
    await finishLoad();
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
  });

  it('drops the held open when focus leaves the field', async () => {
    render(
      <>
        <DateRangeInput value={null} onChange={noop} label="Stay" />
        <button type="button">Next field</button>
      </>,
    );
    act(() => {
      trigger().focus();
    });
    fireEvent.click(trigger());
    act(() => {
      screen.getByRole('button', {name: 'Next field'}).focus();
    });
    await finishLoad();
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('drops the held open on Escape', async () => {
    render(<DateRangeInput value={null} onChange={noop} label="Stay" />);
    fireEvent.click(trigger());
    fireEvent.keyDown(trigger(), {key: 'Escape'});
    await finishLoad();
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens nothing when the field is disabled before Calendar loads', async () => {
    const {rerender} = render(
      <DateRangeInput value={null} onChange={noop} label="Stay" />,
    );
    fireEvent.click(trigger());
    rerender(
      <DateRangeInput value={null} onChange={noop} label="Stay" isDisabled />,
    );
    await finishLoad();
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('stops watching for an outside press at unmount, and opens nothing after it', async () => {
    const {unmount} = render(
      <DateRangeInput value={null} onChange={noop} label="Stay" />,
    );
    const removeListener = vi.spyOn(document, 'removeEventListener');
    fireEvent.click(trigger());
    unmount();
    // The hold's press watch leaves at unmount, not at the next press.
    expect(
      removeListener.mock.calls.some(([type]) => type === 'pointerdown'),
    ).toBe(true);
    removeListener.mockRestore();
    await finishLoad();
    expect(document.querySelector('[aria-haspopup="dialog"]')).toBeNull();
  });

  it('drops the held open when the load fails, and the next press asks again', async () => {
    render(<DateRangeInput value={null} onChange={noop} label="Stay" />);
    fireEvent.click(trigger());
    await finishLoad(false);
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    const loadsBefore = calendarLoad.loads;
    fireEvent.click(trigger());
    expect(calendarLoad.loads).toBe(loadsBefore + 1);
    await finishLoad();
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
  });
});
