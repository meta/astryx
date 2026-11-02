// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useOverflow example shows only the toolbar actions that fit the row and
 * a More menu for the rest. jsdom has no layout, so each test sets the widths
 * the hook reads: every measured child is 100px wide.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import UseOverflowHookUsage from '../../assets/templates/blocks/components/Hooks/useOverflowHookUsage';

// This project does not compile StyleX, and jsdom does no layout, so the
// block's own styles are not what this checks.
vi.mock('@stylexjs/stylex', () => ({
  create: (styles: Record<string, unknown>) =>
    Object.fromEntries(Object.keys(styles).map(key => [key, {}])),
  props: () => ({}),
}));

const ITEM_WIDTH = 100;

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;
let rowWidth = 0;
let resize: ResizeObserverCallback = () => {};

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        resize = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.getAttribute('role') === 'group' ? rowWidth : ITEM_WIDTH;
    },
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

function renderExample(width: number): HTMLElement {
  rowWidth = width;
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UseOverflowHookUsage />);
  });
  const row = container.querySelector<HTMLElement>('[role="group"]');
  if (row == null) {
    throw new Error('no toolbar row rendered');
  }
  return row;
}

function labels(row: HTMLElement): string[] {
  return Array.from(row.querySelectorAll('button'), button =>
    (button.textContent ?? '').trim(),
  );
}

describe('useOverflow example', () => {
  it('shows every action and no More menu when the row is wide', () => {
    const row = renderExample(1000);
    expect(labels(row)).toEqual([
      'Bold',
      'Italic',
      'Underline',
      'Strikethrough',
      'Link',
      'Quote',
      'Code',
      'Clear formatting',
    ]);
  });

  it('moves the actions that do not fit into More, and back on resize', () => {
    // Three 100px actions, three 4px gaps and the 100px More button fit 450px.
    const row = renderExample(450);
    expect(labels(row)).toEqual(['Bold', 'Italic', 'Underline', 'More']);

    rowWidth = 1000;
    act(() => {
      resize(
        [{target: row} as unknown as ResizeObserverEntry],
        {} as ResizeObserver,
      );
    });
    expect(labels(row)).toHaveLength(8);
    expect(labels(row)).not.toContain('More');
  });

  it('lists only the actions that do not fit in the More menu', () => {
    const row = renderExample(450);
    const more = Array.from(row.querySelectorAll('button')).at(-1);
    act(() => {
      more?.focus();
      more?.dispatchEvent(
        new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}),
      );
    });
    const menuItems = Array.from(
      document.querySelectorAll('[role="menuitem"]'),
    ).filter(item => item.closest('[aria-hidden="true"]') == null);
    expect(menuItems.map(item => (item.textContent ?? '').trim())).toEqual([
      'Strikethrough',
      'Link',
      'Quote',
      'Code',
      'Clear formatting',
    ]);
  });

  it('measures every action and the marked More menu in a hidden copy', () => {
    renderExample(450);
    const measure = container.querySelector<HTMLElement>(
      '[aria-hidden="true"]',
    );
    expect(measure?.children).toHaveLength(9);
    expect(
      measure?.lastElementChild?.hasAttribute('data-overflow-indicator'),
    ).toBe(true);
  });
});
