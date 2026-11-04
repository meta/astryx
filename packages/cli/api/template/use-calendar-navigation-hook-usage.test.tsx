// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useCalendarNavigation example drives a custom grid: the header label
 * comes from the hook, Previous/Next navigate months, and pressing ArrowRight
 * on the last day of July flips to August with focus on its first day —
 * the pendingFocus handoff the hook exists for.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import UseCalendarNavigationHookUsage from '../../assets/templates/blocks/components/Calendar/useCalendarNavigationHookUsage';

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

const headerLabel = () =>
  Array.from(container.querySelectorAll('*'))
    .map(el => el.textContent ?? '')
    .find(t => /2026/.test(t) && /July|August|June/i.test(t));

const cell = (day: number) =>
  Array.from(container.querySelectorAll('button')).find(b =>
    b.dataset.date?.endsWith(String(day).padStart(2, '0')),
  ) ??
  Array.from(container.querySelectorAll('button')).find(
    b => b.textContent === String(day),
  );

const pressArrow = (day: number, key: 'ArrowRight' | 'ArrowLeft') => {
  const button = cell(day);
  act(() => {
    button?.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true}));
  });
};

describe('useCalendarNavigationHookUsage example', () => {
  it('navigates months with the buttons and the hook label', () => {
    root = createRoot(container);
    act(() => root!.render(<UseCalendarNavigationHookUsage />));
    expect(headerLabel()).toMatch(/July 2026/i);

    const next = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent === 'Next',
    );
    act(() => next?.click());
    expect(headerLabel()).toMatch(/August 2026/i);
  });

  it('hands focus across the month edge via pendingFocus', () => {
    root = createRoot(container);
    act(() => root!.render(<UseCalendarNavigationHookUsage />));

    // ArrowRight on July 31 flips to August and focuses its first day.
    pressArrow(31, 'ArrowRight');
    expect(headerLabel()).toMatch(/August 2026/i);
    expect(document.activeElement?.getAttribute('data-date')).toBe(
      '2026-08-01',
    );
  });
});
