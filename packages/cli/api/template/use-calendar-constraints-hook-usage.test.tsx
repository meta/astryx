// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useCalendarConstraints example drives a booking grid from one
 * isDateDisabled call: before the season starts days are disabled, Mondays
 * are closed, and once a check-in is picked the span cap disables dates more
 * than 7 days out. Disabled cells carry aria-disabled and refuse the click.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import UseCalendarConstraintsHookUsage from '../../assets/templates/blocks/components/Calendar/useCalendarConstraintsHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.unstubAllGlobals();
});

const cell = (day: number) => {
  const button = Array.from(container.querySelectorAll('button')).find(
    b => b.textContent === String(day),
  );
  return button ?? null;
};

describe('useCalendarConstraintsHookUsage example', () => {
  it('disables closed Mondays and out-of-span days through one check', () => {
    root = createRoot(container);
    act(() => root!.render(<UseCalendarConstraintsHookUsage />));

    // July 2026: the 6th, 13th, 20th and 27th are Mondays — closed.
    for (const monday of [6, 13, 20, 27]) {
      expect(cell(monday)?.getAttribute('aria-disabled')).toBe('true');
    }
    // In-season, open days: the 1st (Wed) and 2nd (Thu).
    expect(cell(1)?.getAttribute('aria-disabled')).toBe('false');
    expect(cell(2)?.getAttribute('aria-disabled')).toBe('false');

    // Pick Thursday the 2nd as check-in.
    act(() => cell(2)?.click());
    // Span cap: 7-day window counting both endpoints → up to the 8th.
    expect(cell(8)?.getAttribute('aria-disabled')).toBe('false');
    // The 9th is one day past the 7-day window: disabled.
    expect(cell(9)?.getAttribute('aria-disabled')).toBe('true');
    // The caption shows the picked check-in.
    expect(container.textContent).toContain('Check-in 2026-07-02');
  });

  it('refuses the pick on a disabled day', () => {
    root = createRoot(container);
    act(() => root!.render(<UseCalendarConstraintsHookUsage />));

    act(() => cell(6)?.click()); // a closed Monday
    expect(container.textContent).not.toContain('Check-in');
  });
});
