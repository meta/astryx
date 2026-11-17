// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useFocusTrap example traps focus in its quick-edit panel: opening it
 * moves focus into the panel, Escape closes it, and closing returns focus to
 * the Quick edit button. Which control focusFirst picks is not asserted here:
 * this jsdom lists querySelectorAll matches by selector, not document order.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, describe, expect, it} from 'vitest';
import UseFocusTrapHookUsage from '../../assets/templates/blocks/components/Hooks/useFocusTrapHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

function renderExample(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UseFocusTrapHookUsage />);
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

function panel(): HTMLElement | null {
  return container.querySelector('[role="dialog"]');
}

function openPanel(): HTMLButtonElement {
  const opener = button('Quick edit');
  act(() => {
    opener.focus();
    opener.click();
  });
  return opener;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe('useFocusTrap example', () => {
  it('moves focus into the panel when it opens', () => {
    renderExample();
    openPanel();
    expect(panel()?.contains(document.activeElement)).toBe(true);
  });

  it('closes on Escape and returns focus to the Quick edit button', () => {
    renderExample();
    const opener = openPanel();
    expect(panel()?.contains(document.activeElement)).toBe(true);
    act(() => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}),
      );
    });
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('returns focus to the Quick edit button after Cancel', () => {
    renderExample();
    const opener = openPanel();
    expect(panel()?.contains(document.activeElement)).toBe(true);
    act(() => button('Cancel').click());
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
