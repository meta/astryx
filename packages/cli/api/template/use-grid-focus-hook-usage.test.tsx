// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useGridFocus example moves focus through its swatch grid with the
 * keyboard and keeps one Tab stop, which moves with that focus.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, describe, expect, it} from 'vitest';
import UseGridFocusHookUsage from '../../assets/templates/blocks/components/Hooks/useGridFocusHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

function renderExample(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UseGridFocusHookUsage />);
  });
}

function swatch(name: string): HTMLButtonElement {
  const match = container.querySelector<HTMLButtonElement>(
    `button[aria-label="${name}"]`,
  );
  if (match == null) {
    throw new Error(`no "${name}" swatch rendered`);
  }
  return match;
}

function focused(): string | null {
  return document.activeElement?.getAttribute('aria-label') ?? null;
}

function press(key: string, init: KeyboardEventInit = {}): void {
  act(() => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', {key, bubbles: true, ...init}),
    );
  });
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe('useGridFocus example', () => {
  it('keeps one Tab stop in the grid', () => {
    renderExample();
    const tabbable = container.querySelectorAll('button[tabindex="0"]');
    expect(
      Array.from(tabbable, cell => cell.getAttribute('aria-label')),
    ).toEqual(['Red']);
    expect(container.querySelectorAll('button[tabindex="-1"]')).toHaveLength(
      15,
    );
  });

  it('moves focus with the arrow keys and moves the Tab stop with it', () => {
    renderExample();
    act(() => swatch('Red').focus());
    press('ArrowRight');
    expect(focused()).toBe('Tomato');
    press('ArrowDown');
    expect(focused()).toBe('Violet');
    press('ArrowLeft');
    expect(focused()).toBe('Indigo');
    press('ArrowUp');
    expect(focused()).toBe('Red');
    press('ArrowDown');
    expect(swatch('Indigo').getAttribute('tabindex')).toBe('0');
    expect(swatch('Red').getAttribute('tabindex')).toBe('-1');
  });

  it('jumps within a row with Home and End, and to the corners with Ctrl', () => {
    renderExample();
    act(() => swatch('Violet').focus());
    press('End');
    expect(focused()).toBe('Black');
    press('Home');
    expect(focused()).toBe('Indigo');
    press('Home', {ctrlKey: true});
    expect(focused()).toBe('Red');
    press('End', {ctrlKey: true});
    expect(focused()).toBe('Black');
  });

  it('picks the swatch that is clicked and exposes it on the focused button', () => {
    renderExample();
    expect(swatch('Red').getAttribute('aria-pressed')).toBe('true');
    act(() => swatch('Teal').click());
    expect(container.textContent).toContain('Selected: Teal');
    expect(
      swatch('Teal')
        .closest('[role="gridcell"]')
        ?.getAttribute('aria-selected'),
    ).toBe('true');
    expect(swatch('Teal').getAttribute('aria-pressed')).toBe('true');
    expect(swatch('Red').getAttribute('aria-pressed')).toBe('false');
  });

  it('exposes the swatch picked from the keyboard on its button', () => {
    renderExample();
    act(() => swatch('Red').focus());
    press('ArrowRight');
    press('ArrowRight');
    // jsdom does not turn Enter on a button into a click, so this does it the
    // way the browser does for the focused swatch.
    act(() => (document.activeElement as HTMLButtonElement).click());
    expect(focused()).toBe('Amber');
    expect(swatch('Amber').getAttribute('aria-pressed')).toBe('true');
    expect(swatch('Red').getAttribute('aria-pressed')).toBe('false');
  });
});
