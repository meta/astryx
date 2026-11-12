// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useMultiCombobox example takes its keys and active option from the
 * hook: the arrow keys move the active option while focus stays in the field,
 * Enter toggles a label and the list stays open, and Escape closes the list.
 * Keys that compose a syllable stay with the input method, Enter with no
 * active option is left to the form, a new query announces its match count,
 * and a query with no match keeps the list shut.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, describe, expect, it, vi} from 'vitest';
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

  it('leaves Home, End, PageUp and PageDown to the field', () => {
    const input = renderExample();
    press(input, 'ArrowDown');
    for (const key of ['Home', 'End', 'PageUp', 'PageDown']) {
      const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        input.dispatchEvent(event);
      });
      expect(event.defaultPrevented, key).toBe(false);
      expect(activeLabel(input), key).toBe('Bug');
    }
  });

  it('closes the list on Escape', () => {
    const input = renderExample();
    press(input, 'ArrowDown');
    expect(listbox()).not.toBeNull();
    press(input, 'Escape');
    expect(listbox()).toBeNull();
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
  });

  it('leaves keys that compose a syllable to the input method', () => {
    const input = renderExample();
    type(input, 'perf');
    expect(activeLabel(input)).toBe('Performance');
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          isComposing: true,
          bubbles: true,
        }),
      );
    });
    expect(selectedOptions()).toEqual([]);
  });

  it('leaves Enter to the form while no option is active', () => {
    const input = renderExample();
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      input.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
  });

  it('announces how many labels match a new query', async () => {
    const input = renderExample();
    // The live region is shared by the whole page, so a message an earlier
    // test left unexposed can still lead it: read the newest message.
    const lastSpoken = () =>
      document.querySelector('[data-astryx-live-region="polite"]')
        ?.textContent ?? '';
    type(input, 'o');
    await vi.waitFor(() => expect(lastSpoken()).toMatch(/(^| )3 labels$/));
    type(input, 'perf');
    await vi.waitFor(() => expect(lastSpoken()).toMatch(/(^| )1 label$/));
    type(input, 'zzz');
    await vi.waitFor(() =>
      expect(lastSpoken()).toMatch(/(^| )No labels match$/),
    );
  });

  it('keeps the list shut on ArrowDown when no label matches', () => {
    const input = renderExample();
    type(input, 'zzz');
    press(input, 'Escape');
    press(input, 'ArrowDown');
    expect(listbox()).toBeNull();
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
  });
});
