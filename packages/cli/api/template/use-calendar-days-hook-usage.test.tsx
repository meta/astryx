// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useCalendarDays example is a December 2026 month table built from the
 * hook's weeks and dayNames. Days outside the month are dimmed, and the Week
 * starts on control reorders the header and the grid.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import UseCalendarDaysHookUsage from '../../assets/templates/blocks/components/Calendar/useCalendarDaysHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

function header(): string[] {
  return Array.from(container.querySelectorAll('thead th')).map(
    cell => cell.textContent ?? '',
  );
}

function rows(): string[][] {
  return Array.from(container.querySelectorAll('tbody tr')).map(row =>
    Array.from(row.querySelectorAll('td')).map(cell => cell.textContent ?? ''),
  );
}

function dayClass(row: number, column: number): string {
  const cells = container.querySelectorAll('tbody tr')[row].children;
  return cells[column].firstElementChild?.className ?? '';
}

function startOn(label: string): void {
  const option = Array.from(container.querySelectorAll('button, label')).find(
    candidate => candidate.textContent === label,
  );
  act(() => (option as HTMLElement | undefined)?.click());
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UseCalendarDaysHookUsage />);
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe('useCalendarDays example', () => {
  it('lays out December 2026 from Sunday, with only the rows it needs', () => {
    expect(header()).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    expect(rows()).toEqual([
      ['29', '30', '1', '2', '3', '4', '5'],
      ['6', '7', '8', '9', '10', '11', '12'],
      ['13', '14', '15', '16', '17', '18', '19'],
      ['20', '21', '22', '23', '24', '25', '26'],
      ['27', '28', '29', '30', '31', '1', '2'],
    ]);
  });

  it('dims the days from November and January', () => {
    const inside = dayClass(0, 2);
    expect(dayClass(0, 0)).not.toBe(inside);
    expect(dayClass(0, 1)).toBe(dayClass(0, 0));
    expect(dayClass(4, 5)).toBe(dayClass(0, 0));
    expect(dayClass(4, 4)).toBe(inside);
  });

  it('reorders the header and the grid when the week starts on Monday', () => {
    startOn('Monday');
    expect(header()).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(rows()[0]).toEqual(['30', '1', '2', '3', '4', '5', '6']);
    expect(rows().at(-1)).toEqual(['28', '29', '30', '31', '1', '2', '3']);
  });
});
