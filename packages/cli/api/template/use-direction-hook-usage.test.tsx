// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import UseDirectionHookUsage from '../../assets/templates/blocks/components/InternationalizationProvider/useDirectionHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<UseDirectionHookUsage />);
  });
});

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
  }
  container.remove();
});

describe('UseDirectionHookUsage', () => {
  it('renders initial LTR direction and updates to RTL when switching locale', () => {
    const canvas = container.querySelector(
      '[data-testid="sparkline-canvas"]',
    ) as HTMLElement;
    expect(canvas).toBeDefined();
    expect(canvas.getAttribute('data-direction')).toBe('ltr');

    // Click Arabic (RTL)
    const arabicButton = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent?.includes('العربية'),
    );
    expect(arabicButton).toBeDefined();

    act(() => {
      arabicButton?.click();
    });

    expect(canvas.getAttribute('data-direction')).toBe('rtl');
  });
});
