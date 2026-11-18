// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useTypeahead example moves focus in its country list to the item whose
 * name starts with the typed letters. A repeated letter cycles through its
 * matches, accents are ignored, and arrow keys still reach useListFocus.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import UseTypeaheadHookUsage from '../../assets/templates/blocks/components/Hooks/useTypeaheadHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

function country(name: string): HTMLButtonElement {
  const match = Array.from(container.querySelectorAll('button')).find(
    candidate => candidate.textContent === name,
  );
  if (match == null) {
    throw new Error(`no "${name}" button rendered`);
  }
  return match;
}

function focused(): string | null | undefined {
  return document.activeElement?.textContent;
}

function type(keys: string): void {
  for (const key of keys) {
    press(key);
  }
}

function press(key: string): void {
  act(() => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true}),
    );
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UseTypeaheadHookUsage />);
  });
  act(() => country('Belgium').focus());
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.useRealTimers();
});

describe('useTypeahead example', () => {
  it('focuses the country that starts with the typed letters', () => {
    type('can');
    expect(focused()).toBe('Canada');

    act(() => vi.advanceTimersByTime(750));
    type('ch');
    expect(focused()).toBe('Chile');
  });

  it('cycles through the matches when one letter is pressed again', () => {
    act(() => country('Canada').focus());
    type('b');
    expect(focused()).toBe('Belgium');
    type('b');
    expect(focused()).toBe('Brazil');
    type('b');
    expect(focused()).toBe('Bulgaria');
  });

  it('ignores accents when it matches', () => {
    type('e');
    expect(focused()).toBe('Éire');
  });

  it('leaves arrow keys to the list focus manager', () => {
    press('ArrowDown');
    expect(focused()).toBe('Brazil');
  });
});
