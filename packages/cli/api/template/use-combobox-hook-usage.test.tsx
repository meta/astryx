// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useCombobox example filters teammates as you type, moves the active
 * option with the arrows while focus stays in the input, picks with Enter or
 * a press, and closes the list with Escape.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, describe, expect, it} from 'vitest';
import UseComboboxHookUsage from '../../assets/templates/blocks/components/Selector/useComboboxHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

function renderExample(): HTMLInputElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UseComboboxHookUsage />);
  });
  const input = container.querySelector('input');
  if (input == null) {
    throw new Error('no input rendered');
  }
  act(() => input.focus());
  return input;
}

function type(input: HTMLInputElement, text: string): void {
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;
  act(() => {
    setValue?.call(input, text);
    input.dispatchEvent(new Event('input', {bubbles: true}));
  });
}

function press(input: HTMLInputElement, key: string): void {
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true}),
    );
  });
}

function options(): string[] {
  return Array.from(
    container.querySelectorAll('[role="option"]'),
    option => option.textContent ?? '',
  );
}

function activeOption(input: HTMLInputElement): string | null {
  const id = input.getAttribute('aria-activedescendant');
  return id == null ? null : (document.getElementById(id)?.textContent ?? null);
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe('useCombobox example', () => {
  it('filters teammates as you type and makes the first match active', () => {
    const input = renderExample();
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    type(input, 'ce');
    expect(options()).toEqual(['Ada Lovelace', 'Grace Hopper (away)']);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(activeOption(input)).toBe('Ada Lovelace');
  });

  it('moves the active option with the arrows while focus stays in the input', () => {
    const input = renderExample();
    press(input, 'ArrowDown');
    expect(activeOption(input)).toBe('Ada Lovelace');
    press(input, 'ArrowDown');
    press(input, 'ArrowDown');
    // Grace Hopper is away (disabled), so the arrows skip her.
    expect(activeOption(input)).toBe('Katherine Johnson');
    press(input, 'ArrowUp');
    expect(activeOption(input)).toBe('Alan Turing');
    expect(document.activeElement).toBe(input);
    expect(
      Array.from(
        container.querySelectorAll('[role="option"][aria-selected="true"]'),
        option => option.textContent,
      ),
    ).toEqual(['Alan Turing']);
  });

  it('picks the active option with Enter and closes the list', () => {
    const input = renderExample();
    type(input, 'mar');
    press(input, 'Enter');
    expect(container.textContent).toContain('Assigned to Margaret Hamilton');
    expect(options()).toEqual([]);
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
  });

  it('picks an option from a press while focus stays in the input', () => {
    const input = renderExample();
    type(input, 'a');
    const alan = Array.from(
      container.querySelectorAll<HTMLElement>('[role="option"]'),
    ).find(option => option.textContent === 'Alan Turing');
    act(() => {
      alan?.dispatchEvent(
        new MouseEvent('mousedown', {bubbles: true, cancelable: true}),
      );
      alan?.click();
    });
    expect(container.textContent).toContain('Assigned to Alan Turing');
    expect(document.activeElement).toBe(input);
  });

  it('closes the list with Escape', () => {
    const input = renderExample();
    type(input, 'a');
    expect(options()).not.toEqual([]);
    press(input, 'Escape');
    expect(options()).toEqual([]);
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(container.textContent).toContain('Unassigned');
  });
});
