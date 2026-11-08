// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useCollator example sorts its names with the provider-bound collator,
 * so the order follows the locale: English keeps Å and Ö beside A and O,
 * Swedish moves them after Z.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, describe, expect, it} from 'vitest';
import UseCollatorHookUsage from '../../assets/templates/blocks/components/Hooks/useCollatorHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

function renderExample(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UseCollatorHookUsage />);
  });
}

function names(): string[] {
  return Array.from(container.querySelectorAll('li'), item =>
    (item.textContent ?? '').trim(),
  );
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe('useCollator example', () => {
  it('sorts accented and lowercase names for English', () => {
    renderExample();
    expect(names()).toEqual([
      'Ana',
      'Åsa',
      'Émile',
      'emma',
      'Örjan',
      'oscar',
      'Zoë',
    ]);
  });

  it('re-sorts for Swedish when the provider locale changes', () => {
    renderExample();
    const swedish = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent === 'Swedish',
    );
    expect(swedish).toBeDefined();
    act(() => swedish?.click());
    expect(names()).toEqual([
      'Ana',
      'Émile',
      'emma',
      'oscar',
      'Zoë',
      'Åsa',
      'Örjan',
    ]);
  });
});
