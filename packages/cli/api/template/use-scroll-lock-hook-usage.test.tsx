// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useScrollLock example pins the page while its full-screen menu is open
 * and puts the reader back at the same scroll position when it closes.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, describe, expect, it, vi} from 'vitest';
import UseScrollLockHookUsage from '../../assets/templates/blocks/components/Hooks/useScrollLockHookUsage';

// The node project does not compile StyleX, and the menu's styles are not under test.
vi.mock('@stylexjs/stylex', () => ({
  create: <T,>(styles: T) => styles,
  props: () => ({}),
}));

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

function renderExample(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UseScrollLockHookUsage />);
  });
}

function button(label: string): HTMLButtonElement {
  const match = Array.from(container.querySelectorAll('button')).find(
    candidate => candidate.textContent === label,
  );
  if (match == null) {
    throw new Error(`no "${label}" button rendered`);
  }
  return match;
}

function menu(): HTMLElement | null {
  return container.querySelector('nav[aria-label="Site menu"]');
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  document.body.style.cssText = '';
  document.documentElement.style.cssText = '';
  vi.restoreAllMocks();
});

describe('useScrollLock example', () => {
  it('pins the page at the current scroll position while the menu is open', () => {
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(640);
    renderExample();
    expect(document.body.style.position).toBe('');

    act(() => button('Menu').click());

    expect(menu()).not.toBeNull();
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.style.position).toBe('fixed');
    expect(document.body.style.top).toBe('-640px');
  });

  it('unpins the page and restores the scroll position when the menu closes', () => {
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(640);
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    renderExample();
    act(() => button('Menu').click());

    act(() => button('Close menu').click());

    expect(menu()).toBeNull();
    expect(document.body.style.overflow).toBe('');
    expect(document.body.style.position).toBe('');
    expect(scrollTo).toHaveBeenCalledWith(0, 640);
  });

  it('unpins the page when a menu link is followed', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    renderExample();
    act(() => button('Menu').click());
    expect(document.body.style.position).toBe('fixed');

    act(() => {
      menu()?.querySelector<HTMLAnchorElement>('a')?.click();
    });

    expect(menu()).toBeNull();
    expect(document.body.style.position).toBe('');
  });
});
