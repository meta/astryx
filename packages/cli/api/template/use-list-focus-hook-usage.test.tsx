// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useListFocus example moves focus between its rows from the keyboard:
 * arrows step and wrap, Home and End jump to the ends, and only one row is in
 * the tab order. Arrow keys move that tab stop with focus.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, describe, expect, it} from 'vitest';
import UseListFocusHookUsage from '../../assets/templates/blocks/components/Hooks/useListFocusHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

function renderExample(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UseListFocusHookUsage />);
  });
}

function rows(): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('button'));
}

function focusedRow(): string | undefined {
  return document.activeElement?.textContent ?? undefined;
}

function tabbableRows(): string[] {
  return rows()
    .filter(row => row.getAttribute('tabindex') !== '-1')
    .map(row => row.textContent ?? '');
}

function press(key: string): void {
  act(() => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true}),
    );
  });
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe('useListFocus example', () => {
  it('puts only the first row in the tab order', () => {
    renderExample();
    expect(tabbableRows()).toEqual(['Q3 roadmap.pdf']);
  });

  it('moves focus and the tab stop with ArrowDown and ArrowUp', () => {
    renderExample();
    act(() => rows()[0].focus());
    press('ArrowDown');
    expect(focusedRow()).toBe('Budget 2026.xlsx');
    expect(tabbableRows()).toEqual(['Budget 2026.xlsx']);
    press('ArrowUp');
    expect(focusedRow()).toBe('Q3 roadmap.pdf');
    expect(tabbableRows()).toEqual(['Q3 roadmap.pdf']);
  });

  it('jumps with Home and End and wraps at the ends', () => {
    renderExample();
    act(() => rows()[0].focus());
    press('End');
    expect(focusedRow()).toBe('Launch checklist.md');
    press('ArrowDown');
    expect(focusedRow()).toBe('Q3 roadmap.pdf');
    press('ArrowUp');
    expect(focusedRow()).toBe('Launch checklist.md');
    press('Home');
    expect(focusedRow()).toBe('Q3 roadmap.pdf');
  });
});
