// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useTranslator example takes its button label and its count text from
 * the translator, so both follow the provider locale and the count follows
 * the rows shown.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, describe, expect, it} from 'vitest';
import UseTranslatorHookUsage from '../../assets/templates/blocks/components/Hooks/useTranslatorHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

function renderExample(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UseTranslatorHookUsage />);
  });
}

function button(label: string): HTMLButtonElement {
  const match = Array.from(
    container.querySelectorAll<HTMLButtonElement>('button'),
  ).find(candidate => candidate.textContent === label);
  if (match == null) {
    throw new Error(`no "${label}" button rendered`);
  }
  return match;
}

function rowCount(): number {
  return container.querySelectorAll('li').length;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe('useTranslator example', () => {
  it('shows the English label and count, and updates the count on Load more', () => {
    renderExample();
    expect(rowCount()).toBe(3);
    expect(container.textContent).toContain('Showing 3 of 9');

    act(() => button('Load more').click());
    expect(rowCount()).toBe(6);
    expect(container.textContent).toContain('Showing 6 of 9');

    act(() => button('Load more').click());
    expect(rowCount()).toBe(9);
    expect(container.textContent).toContain('Showing 9 of 9');
  });

  it('shows the French label and count when the provider locale changes', () => {
    renderExample();
    act(() => button('Load more').click());
    act(() => button('Français').click());

    expect(button('Charger plus')).toBeDefined();
    expect(container.textContent).toContain('6 sur 9 affichées');
    expect(container.textContent).not.toContain('Load more');
  });
});
