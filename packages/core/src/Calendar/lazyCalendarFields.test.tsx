// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file lazyCalendarFields.test.tsx
 * @input vitest (jsdom), Testing Library, DateTimeInput with the shared
 *   Calendar host mocked so each case controls when the load lands
 * @output Tests that DateTimeInput's popover Calendar loads on the field's first
 *   intent, not with the page: no load before an intent; a mouse entry, a
 *   focus or a press starts it and a finger's entry does not; an open asked
 *   for before the load is held and opens once, with focus kept in the input
 *   for an open from the input; Escape or a failed load drops the hold; the
 *   native picker loads nothing
 * @position Testing for useLazyCalendarOpen.ts with DateTimeInput.tsx
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import type {ReactElement} from 'react';
import {beforeEach, describe, expect, it, vi} from 'vitest';

// One load runs at a time, as with the shared module loader: every call
// while it runs gets the same promise.
const calendarLoad = vi.hoisted(() => ({
  isLoaded: false,
  loads: 0,
  pending: null as Promise<boolean> | null,
  finish: (_isLoaded: boolean) => {},
}));

vi.mock('./LazyCalendar', () => ({
  isCalendarLoaded: () => calendarLoad.isLoaded,
  loadCalendar: async () => {
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
  LazyCalendar: () => <div data-testid="lazy-calendar" />,
}));

import {DateTimeInput} from '../DateTimeInput/DateTimeInput';

const noop = () => {};

const FIELDS: {name: string; element: () => ReactElement}[] = [
  {
    name: 'DateTimeInput',
    element: () => <DateTimeInput label="Starts" onChange={noop} />,
  },
];

function toggle(): HTMLElement {
  return screen.getByRole('button', {name: /calendar/i});
}

function dateInput(): HTMLElement {
  return screen.getAllByRole('combobox')[0];
}

function field(): HTMLElement {
  const el = dateInput().parentElement;
  if (el == null) {
    throw new Error('no field element');
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

describe.each(FIELDS)('$name Calendar on first intent', ({element}) => {
  it('loads nothing before an intent', () => {
    render(element());
    expect(calendarLoad.loads).toBe(0);
    expect(screen.queryByTestId('lazy-calendar')).toBeNull();
  });

  it('starts the load on a mouse entry, but not on a finger', () => {
    render(element());
    fireEvent.pointerEnter(field(), {pointerType: 'touch'});
    expect(calendarLoad.loads).toBe(0);
    fireEvent.pointerEnter(field(), {pointerType: 'mouse'});
    expect(calendarLoad.loads).toBe(1);
  });

  it('starts the load on a focus', () => {
    render(element());
    act(() => {
      dateInput().focus();
    });
    expect(calendarLoad.loads).toBe(1);
  });

  it('holds an open from the toggle and opens once when Calendar loads', async () => {
    render(element());
    fireEvent.click(toggle());
    fireEvent.click(toggle());
    expect(dateInput()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('lazy-calendar')).toBeNull();
    await finishLoad();
    expect(dateInput()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByTestId('lazy-calendar')).toHaveLength(1);
  });

  it('holds an open from the input with ArrowDown and keeps focus there', async () => {
    render(element());
    act(() => {
      dateInput().focus();
    });
    fireEvent.keyDown(dateInput(), {key: 'ArrowDown'});
    expect(dateInput()).toHaveAttribute('aria-expanded', 'false');
    await finishLoad();
    expect(dateInput()).toHaveAttribute('aria-expanded', 'true');
    expect(dateInput()).toHaveFocus();
  });

  it('opens as the latest held open asks, with focus kept in the input', async () => {
    render(element());
    act(() => {
      dateInput().focus();
    });
    fireEvent.click(toggle());
    act(() => {
      dateInput().focus();
    });
    fireEvent.keyDown(dateInput(), {key: 'ArrowDown'});
    await finishLoad();
    expect(dateInput()).toHaveAttribute('aria-expanded', 'true');
    expect(dateInput()).toHaveFocus();
  });

  it('drops the held open on Escape', async () => {
    render(element());
    act(() => {
      dateInput().focus();
    });
    fireEvent.keyDown(dateInput(), {key: 'ArrowDown'});
    fireEvent.keyDown(dateInput(), {key: 'Escape'});
    await finishLoad();
    expect(dateInput()).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps the field closed when Calendar fails to load', async () => {
    render(element());
    fireEvent.click(toggle());
    await finishLoad(false);
    expect(dateInput()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('lazy-calendar')).toBeNull();
  });
});

describe('DateTimeInput with the native picker', () => {
  it('loads no Calendar on an intent', () => {
    render(
      <DateTimeInput label="Starts" onChange={noop} presentation="native" />,
    );
    const input = screen.getAllByLabelText(/Starts/)[0];
    act(() => {
      input.focus();
    });
    fireEvent.pointerDown(input);
    expect(calendarLoad.loads).toBe(0);
  });
});
