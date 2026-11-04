// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useScrollLock example locks the page while its full-screen menu is open,
 * without moving it, and frees it again when the menu closes. The
 * menu covers the page, so it also keeps keyboard focus inside itself
 * (useFocusTrap): focus moves in on open, Escape closes, and focus returns to
 * the Menu button.
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
  it('locks the page without moving it while the menu is open', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    renderExample();
    expect(document.documentElement.style.overflow).toBe('');

    act(() => button('Menu').click());

    expect(menu()).not.toBeNull();
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(document.body.style.position).toBe('');
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('frees the page where the reader left it when the menu closes', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    renderExample();
    act(() => button('Menu').click());

    act(() => button('Close menu').click());

    expect(menu()).toBeNull();
    expect(document.documentElement.style.overflow).toBe('');
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('frees the page when a menu link is followed', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    renderExample();
    act(() => button('Menu').click());
    expect(document.documentElement.style.overflow).toBe('hidden');

    act(() => {
      menu()?.querySelector<HTMLAnchorElement>('a')?.click();
    });

    expect(menu()).toBeNull();
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('moves focus into the menu and returns it to Menu on Close menu', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    renderExample();
    const opener = button('Menu');
    act(() => {
      opener.focus();
      opener.click();
    });
    expect(menu()?.contains(document.activeElement)).toBe(true);

    act(() => button('Close menu').click());

    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('closes on Escape and returns focus to Menu', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    renderExample();
    const opener = button('Menu');
    act(() => {
      opener.focus();
      opener.click();
    });

    act(() => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}),
      );
    });

    expect(menu()).toBeNull();
    expect(document.documentElement.style.overflow).toBe('');
    expect(document.activeElement).toBe(opener);
  });
});
