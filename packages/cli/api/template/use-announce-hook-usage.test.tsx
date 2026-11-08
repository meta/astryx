// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useAnnounce example announces the filter's result count once typing
 * pauses, not on every keystroke, and says "No results" when nothing matches.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import UseAnnounceHookUsage from '../../assets/templates/blocks/components/Hooks/useAnnounceHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

function renderExample(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UseAnnounceHookUsage />);
  });
}

/** Type a value into the controlled filter field. */
function type(value: string): void {
  const input = container.querySelector('input');
  if (input == null) {
    throw new Error('no filter field rendered');
  }
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;
  act(() => {
    setValue?.call(input, value);
    input.dispatchEvent(new Event('input', {bubbles: true}));
  });
}

function wait(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
    vi.advanceTimersToNextFrame();
  });
}

function spoken(): string | null | undefined {
  return document.querySelector('[data-astryx-live-region="polite"]')
    ?.textContent;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.useRealTimers();
});

describe('useAnnounce example', () => {
  it('announces the count once typing pauses', () => {
    renderExample();
    type('d');
    wait(200);
    type('de');
    wait(200);
    type('desk');
    wait(200);
    expect(spoken() ?? '').toBe('');
    wait(300);
    expect(spoken()).toBe('3 results');
    expect(container.querySelectorAll('li')).toHaveLength(3);
  });

  it('announces "No results" when nothing matches', () => {
    renderExample();
    type('sofa');
    wait(500);
    expect(spoken()).toBe('No results');
  });
});
