// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useMultiCombobox example takes its keys and active option from the
 * hook: the arrow keys move the active option while focus stays in the field,
 * Enter toggles a label and the list stays open, and Escape closes the list.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, describe, expect, it} from 'vitest';
import UseMultiComboboxHookUsage from '../../assets/templates/blocks/components/MultiSelector/useMultiComboboxHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

function renderExample(): HTMLInputElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UseMultiComboboxHookUsage />);
  });
  const input = container.querySelector<HTMLInputElement>('[role="combobox"]');
  if (input == null) {
    throw new Error('no combobox rendered');
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
    input.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true}));
  });
}

function listbox(): HTMLElement | null {
  return container.querySelector('[role="listbox"]');
}

function activeLabel(input: HTMLInputElement): string | null {
  const id = input.getAttribute('aria-activedescendant');
  return id == null ? null : (document.getElementById(id)?.textContent ?? '');
}

function selectedOptions(): string[] {
  return Array.from(
    container.querySelectorAll('[role="option"][aria-checked="true"]'),
    option => option.textContent ?? '',
  );
}

/** The remove buttons of the tokens above the field, one per selected label. */
function tokenRemoveLabels(): string[] {
  return Array.from(
    container.querySelectorAll('button[aria-label]'),
    button => button.getAttribute('aria-label') ?? '',
  );
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe('useMultiCombobox example', () => {
  it('moves the active option with the arrow keys while focus stays in the field', () => {
    const input = renderExample();
    press(input, 'ArrowDown');
    expect(listbox()).not.toBeNull();
    expect(activeLabel(input)).toBe('Bug');
    press(input, 'ArrowDown');
    expect(activeLabel(input)).toBe('Documentation');
    expect(document.activeElement).toBe(input);
  });

  it('toggles the active label with Enter and keeps the list open', () => {
    const input = renderExample();
    type(input, 'perf');
    expect(activeLabel(input)).toBe('Performance');
    press(input, 'Enter');
    expect(listbox()).not.toBeNull();
    expect(selectedOptions()).toEqual(['Performance']);
    expect(tokenRemoveLabels()).toHaveLength(2);
    press(input, 'Enter');
    expect(listbox()).not.toBeNull();
    expect(selectedOptions()).toEqual([]);
    expect(tokenRemoveLabels()).toHaveLength(1);
  });

  it('toggles a clicked label and keeps the list open', () => {
    const input = renderExample();
    press(input, 'ArrowDown');
    const option = Array.from(
      container.querySelectorAll<HTMLElement>('[role="option"]'),
    ).find(candidate => candidate.textContent === 'Accessibility');
    act(() => option?.click());
    expect(listbox()).not.toBeNull();
    expect(selectedOptions()).toEqual(['Bug', 'Accessibility']);
  });

  it('moves focus back to the field when a token is removed', () => {
    const input = renderExample();
    const remove = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove Bug"]',
    );
    act(() => remove?.focus());
    act(() => remove?.click());
    expect(tokenRemoveLabels()).toEqual([]);
    expect(document.activeElement).toBe(input);
  });

  it('closes the list on Escape', () => {
    const input = renderExample();
    press(input, 'ArrowDown');
    expect(listbox()).not.toBeNull();
    press(input, 'Escape');
    expect(listbox()).toBeNull();
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
  });
});
