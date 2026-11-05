// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useToast example shows its toasts through the hook: Save shows one
 * "Settings saved" toast however often it is pressed, Undo restores the
 * value from before the save, and a failed save shows an error toast instead.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import UseToastHookUsage from '../../assets/templates/blocks/components/Toast/useToastHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

async function renderExample(): Promise<void> {
  expect(document.querySelectorAll('[data-toast-id]')).toHaveLength(0);
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<UseToastHookUsage />);
  });
}

function button(label: string): HTMLButtonElement {
  const match = Array.from(
    document.querySelectorAll<HTMLButtonElement>('button'),
  ).find(candidate => candidate.textContent === label);
  if (match == null) {
    throw new Error(`no "${label}" button rendered`);
  }
  return match;
}

async function press(label: string): Promise<void> {
  await act(async () => {
    button(label).click();
  });
}

/** How many shown toasts read `text`, leaving out live-region copies. */
function count(text: string): number {
  return Array.from(
    document.querySelectorAll('[data-toast-id]'),
    shown => shown.textContent ?? '',
  ).filter(shown => shown.includes(text)).length;
}

beforeAll(() => {
  // No LayerProvider here, so the hook warns once and uses its fallback.
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
});

afterEach(async () => {
  // Dismiss every toast, then end the collapse transition jsdom never runs,
  // so the shared viewport is empty for the next test.
  for (const dismiss of document.querySelectorAll<HTMLButtonElement>(
    '[data-toast-id] button[aria-label="Dismiss notification"]',
  )) {
    await act(async () => dismiss.click());
  }
  for (const row of document.querySelectorAll('[data-toast-id]')) {
    const collapsed = Object.assign(
      new Event('transitionend', {bubbles: true}),
      {propertyName: 'grid-template-rows'},
    );
    await act(async () => row.dispatchEvent(collapsed));
  }
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe('useToast example', () => {
  it('shows one "Settings saved" toast however often Save is pressed', async () => {
    await renderExample();
    await press('Save');
    await press('Save');
    expect(count('Settings saved')).toBe(1);
  });

  it('restores the previous name from Undo, even after a repeated Save', async () => {
    await renderExample();
    const input = container.querySelector('input[type="text"]');
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    act(() => {
      setValue?.call(input, 'Grace Hopper');
      input?.dispatchEvent(new Event('input', {bubbles: true}));
    });
    await press('Save');
    await press('Save');
    await press('Undo');
    expect((input as HTMLInputElement).value).toBe('Ada Lovelace');
  });

  it('shows an error toast when the save fails', async () => {
    await renderExample();
    const toggle = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    await act(async () => toggle?.click());
    await press('Save');
    expect(count('Could not save settings')).toBe(1);
    expect(count('Settings saved')).toBe(0);
  });
});
