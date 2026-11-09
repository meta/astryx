// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useCalendarConstraints example demonstrates a hotel booking range picker
 * enforcing season bounds (Jun 5 - Jun 25), closed Mondays, and a 7-night
 * maximum stay once check-in is selected.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import UseCalendarConstraintsHookUsage from '../../assets/templates/blocks/components/Calendar/useCalendarConstraintsHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

function findButtonByDay(dayNumber: number): HTMLButtonElement | undefined {
  const buttons = Array.from(
    container.querySelectorAll('tbody button'),
  ) as HTMLButtonElement[];
  return buttons.find(btn => btn.textContent?.trim() === String(dayNumber));
}

function clickDay(dayNumber: number): void {
  const btn = findButtonByDay(dayNumber);
  expect(btn).toBeDefined();
  act(() => {
    btn?.click();
  });
}

function clickReset(): void {
  const resetBtn = Array.from(container.querySelectorAll('button')).find(
    btn => btn.textContent?.trim() === 'Reset',
  );
  expect(resetBtn).toBeDefined();
  act(() => {
    resetBtn?.click();
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<UseCalendarConstraintsHookUsage />);
  });
});

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
  }
  container.remove();
});

describe('UseCalendarConstraintsHookUsage', () => {
  it('disables dates outside season bounds and on closed Mondays initially', () => {
    // June 1, 2026 is Monday and before min (Jun 5) -> disabled
    expect(findButtonByDay(1)?.disabled).toBe(true);
    // June 4, 2026 is Thursday before min -> disabled
    expect(findButtonByDay(4)?.disabled).toBe(true);

    // June 5, 2026 is Friday (season start) -> enabled
    expect(findButtonByDay(5)?.disabled).toBe(false);

    // June 8, 2026 is Monday -> disabled by custom rule
    expect(findButtonByDay(8)?.disabled).toBe(true);

    // June 15, 2026 is Monday -> disabled by custom rule
    expect(findButtonByDay(15)?.disabled).toBe(true);

    // June 25, 2026 is Thursday (season end) -> enabled
    expect(findButtonByDay(25)?.disabled).toBe(false);

    // June 26, 2026 is Friday (after max) -> disabled
    expect(findButtonByDay(26)?.disabled).toBe(true);
  });

  it('restricts dates beyond maxRangeSpan after check-in is picked and restores after booking', () => {
    // Pick check-in: June 5
    clickDay(5);

    expect(container.textContent).toContain('Check-in: Jun 5 (pick check-out)');
    expect(findButtonByDay(5)?.getAttribute('aria-pressed')).toBe('true');

    // With check-in on Jun 5 and maxRangeSpan 8:
    // Reachable span is 7 nights: June 5 to June 12
    // June 10 (Wednesday) is within 7 nights -> enabled
    expect(findButtonByDay(10)?.disabled).toBe(false);
    // June 12 (Friday, exactly 7 nights) -> enabled
    expect(findButtonByDay(12)?.disabled).toBe(false);
    // June 13 (Saturday, 8 nights away) -> disabled by maxRangeSpan!
    expect(findButtonByDay(13)?.disabled).toBe(true);

    // Pick check-out: June 10
    clickDay(10);
    expect(container.textContent).toContain('Booked: Jun 5 – Jun 10');
    expect(findButtonByDay(10)?.getAttribute('aria-pressed')).toBe('true');

    // Once booked, rangeAnchor is cleared so later dates (e.g. June 13) are no longer capped
    expect(findButtonByDay(13)?.disabled).toBe(false);

    // Click Reset
    clickReset();
    expect(container.textContent).toContain('Pick a check-in date');
    expect(findButtonByDay(5)?.getAttribute('aria-pressed')).toBe('false');
  });

  it('treats a pick on or before check-in as a new check-in (reverse pick)', () => {
    // Pick check-in: June 12
    clickDay(12);
    expect(container.textContent).toContain(
      'Check-in: Jun 12 (pick check-out)',
    );

    // Reverse pick: click June 6 (earlier than June 12)
    clickDay(6);
    // Should now become the new check-in date
    expect(container.textContent).toContain('Check-in: Jun 6 (pick check-out)');
    expect(findButtonByDay(6)?.getAttribute('aria-pressed')).toBe('true');
    expect(findButtonByDay(12)?.getAttribute('aria-pressed')).toBe('false');
  });
});
