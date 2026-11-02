// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useLocale example formats its invoice date and amount with the
 * provider locale the hook returns, so switching the provider to German
 * reformats both.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, describe, expect, it} from 'vitest';
import UseLocaleHookUsage from '../../assets/templates/blocks/components/Hooks/useLocaleHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

function renderExample(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UseLocaleHookUsage />);
  });
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe('useLocale example', () => {
  it('formats the invoice for English', () => {
    renderExample();
    expect(container.textContent).toContain('Nov 2, 2026');
    expect(container.textContent).toContain('$1,234.50');
  });

  it('reformats the invoice when the provider locale changes to German', () => {
    renderExample();
    const german = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent === 'German',
    );
    expect(german).toBeDefined();
    act(() => german?.click());
    expect(container.textContent).toContain('2. Nov. 2026');
    expect(container.textContent).toContain('1.234,50 $');
  });
});
