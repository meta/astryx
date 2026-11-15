// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useTreeFocus example is a file tree with the WAI-ARIA tree keyboard
 * model: arrows move over the visible rows and open or close folders, Home and
 * End jump to the ends, a typed letter jumps to a name, Enter opens a file,
 * and only one row is in the tab order.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import UseTreeFocusHookUsage from '../../assets/templates/blocks/components/Hooks/useTreeFocusHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

function rows(): HTMLElement[] {
  return Array.from(container.querySelectorAll('[role="treeitem"]'));
}

function row(name: string): HTMLElement {
  const match = rows().find(candidate => candidate.textContent === name);
  if (match == null) {
    throw new Error(`no "${name}" row rendered`);
  }
  return match;
}

function focused(): string | null | undefined {
  return document.activeElement?.textContent;
}

function press(key: string): void {
  act(() => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true}),
    );
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UseTreeFocusHookUsage />);
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.useRealTimers();
});

describe('useTreeFocus example', () => {
  it('keeps one row in the tab order and moves it with focus', () => {
    expect(rows().filter(item => item.tabIndex === 0)).toEqual([row('src')]);

    act(() => row('src').focus());
    press('ArrowDown');

    expect(focused()).toBe('index.ts');
    expect(rows().filter(item => item.tabIndex === 0)).toEqual([
      row('index.ts'),
    ]);
  });

  it('moves over the visible rows with ArrowUp, ArrowDown, Home and End', () => {
    act(() => row('src').focus());
    press('End');
    expect(focused()).toBe('README.md');
    press('ArrowUp');
    expect(focused()).toBe('package.json');
    press('ArrowUp');
    expect(focused()).toBe('docs');
    press('Home');
    expect(focused()).toBe('src');
  });

  it('opens, enters, leaves and closes a folder with ArrowRight and ArrowLeft', () => {
    act(() => row('docs').focus());
    press('ArrowRight');
    expect(row('docs').getAttribute('aria-expanded')).toBe('true');
    expect(focused()).toBe('docs');

    press('ArrowRight');
    expect(focused()).toBe('intro.md');

    press('ArrowLeft');
    expect(focused()).toBe('docs');

    press('ArrowLeft');
    expect(row('docs').getAttribute('aria-expanded')).toBe('false');
    expect(rows().map(item => item.textContent)).not.toContain('intro.md');
  });

  it('jumps to a name that starts with the typed letter', () => {
    vi.useFakeTimers();
    act(() => row('src').focus());
    press('r');
    expect(focused()).toBe('README.md');
    act(() => vi.advanceTimersByTime(500));
    press('t');
    expect(focused()).toBe('theme.ts');
  });

  it('opens a file on Enter', () => {
    act(() => row('src').focus());
    press('p');
    press('Enter');
    expect(container.textContent).toContain('Open file: package.json');
  });
});
