// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useCalendarNavigation example demonstrates month-by-month pagination
 * using Previous/Next controls and keyboard arrow navigation moving across
 * month boundaries via pendingFocus.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import UseCalendarNavigationHookUsage from '../../assets/templates/blocks/components/Calendar/useCalendarNavigationHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

function clickButton(label: string): void {
  const btn = Array.from(container.querySelectorAll('button')).find(
    b => b.textContent?.trim() === label,
  );
  expect(btn).toBeDefined();
  act(() => {
    btn?.click();
  });
}

function findDayButton(dayNumber: number): HTMLButtonElement | undefined {
  const buttons = Array.from(
    container.querySelectorAll('tbody button'),
  ) as HTMLButtonElement[];
  return buttons.find(
    btn => !btn.disabled && btn.textContent?.trim() === String(dayNumber),
  );
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<UseCalendarNavigationHookUsage />);
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

describe('UseCalendarNavigationHookUsage', () => {
  it('renders initial month and navigates via Next and Previous buttons', () => {
    expect(container.textContent).toContain('June 2026');

    // Click Next -> July 2026
    clickButton('Next');
    expect(container.textContent).toContain('July 2026');

    // Click Next again -> August 2026
    clickButton('Next');
    expect(container.textContent).toContain('August 2026');

    // Click Previous -> July 2026
    clickButton('Previous');
    expect(container.textContent).toContain('July 2026');
  });

  it('advances month and shifts focus when pressing ArrowRight on the last day', () => {
    expect(container.textContent).toContain('June 2026');

    // June 30 is the last day of June
    const day30 = findDayButton(30);
    expect(day30).toBeDefined();

    act(() => {
      day30?.focus();
      day30?.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    // Should have transitioned to July 2026 and focused day 1
    expect(container.textContent).toContain('July 2026');
    expect(document.activeElement?.textContent?.trim()).toBe('1');
  });

  it('reverses arrow direction in right-to-left layout (DR6, DR11)', () => {
    container.setAttribute('dir', 'rtl');
    const getComputedStyleSpy = vi
      .spyOn(window, 'getComputedStyle')
      .mockImplementation((elt: Element) => {
        const closestDir = elt.closest('[dir]')?.getAttribute('dir');
        return {
          direction: closestDir === 'rtl' ? 'rtl' : 'ltr',
        } as CSSStyleDeclaration;
      });

    expect(container.textContent).toContain('June 2026');

    const day30 = findDayButton(30);
    expect(day30).toBeDefined();

    act(() => {
      day30?.focus();
      // In RTL, ArrowLeft navigates forward to next day
      day30?.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowLeft',
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(container.textContent).toContain('July 2026');
    expect(document.activeElement?.textContent?.trim()).toBe('1');
    getComputedStyleSpy.mockRestore();
  });

  it('preserves standard arrow direction in nested LTR region inside RTL parent (DR11)', () => {
    container.setAttribute('dir', 'rtl');
    const nestedWrapper = document.createElement('div');
    nestedWrapper.setAttribute('dir', 'ltr');
    container.appendChild(nestedWrapper);

    const nestedRoot = createRoot(nestedWrapper);
    act(() => {
      nestedRoot.render(<UseCalendarNavigationHookUsage />);
    });

    const getComputedStyleSpy = vi
      .spyOn(window, 'getComputedStyle')
      .mockImplementation((elt: Element) => {
        const closestDir = elt.closest('[dir]')?.getAttribute('dir');
        return {
          direction: closestDir === 'rtl' ? 'rtl' : 'ltr',
        } as CSSStyleDeclaration;
      });

    const nestedButtons = Array.from(
      nestedWrapper.querySelectorAll('tbody button'),
    ) as HTMLButtonElement[];
    const day30 = nestedButtons.find(
      btn => !btn.disabled && btn.textContent?.trim() === '30',
    );
    expect(day30).toBeDefined();

    act(() => {
      day30?.focus();
      // In nested LTR, ArrowRight navigates forward to next day
      day30?.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(nestedWrapper.textContent).toContain('July 2026');
    expect(document.activeElement?.textContent?.trim()).toBe('1');

    act(() => {
      nestedRoot.unmount();
    });
    getComputedStyleSpy.mockRestore();
  });

  it('ensures no two day buttons share an accessible name', () => {
    expect(container.textContent).toContain('June 2026');

    // Inside the accessibility tree, only active days in the current month have accessible names
    const activeDayButtons = Array.from(
      container.querySelectorAll('tbody button:not([aria-hidden="true"])'),
    ) as HTMLButtonElement[];

    expect(activeDayButtons.length).toBe(30);

    const names = activeDayButtons.map(btn => btn.getAttribute('aria-label'));
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(activeDayButtons.length);

    // Outside filler days are aria-hidden and do not expose colliding month names
    const outsideButtons = Array.from(
      container.querySelectorAll('tbody button[aria-hidden="true"]'),
    ) as HTMLButtonElement[];
    expect(outsideButtons.length).toBeGreaterThan(0);
    for (const btn of outsideButtons) {
      expect(btn.getAttribute('aria-label')).toBeNull();
    }
  });
});
