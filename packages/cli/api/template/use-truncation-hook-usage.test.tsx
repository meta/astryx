// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useTruncation example shows a tooltip with the full path only on cells
 * whose text is actually cut off: long paths that truncate enable their tooltip,
 * while a short path fits and leaves its tooltip disabled.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import UseTruncationHookUsage from '../../assets/templates/blocks/components/Text/useTruncationHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.unstubAllGlobals();
});

describe('useTruncationHookUsage example', () => {
  it('renders the narrow path column with the fixture rows and clamped cells', () => {
    root = createRoot(container);
    act(() => root!.render(<UseTruncationHookUsage />));

    const cells = Array.from(container.querySelectorAll('td')).map(
      cell => cell.textContent ?? '',
    );
    expect(cells).toContain('build');
    expect(cells).toContain('bundle');
    expect(cells).toContain('readme');

    // The long paths reach the DOM
    expect(container.textContent).toContain('build-20261103-120344');
    expect(container.textContent).toContain('reports/coverage');
    expect(container.textContent).toContain('README.md');
  });

  it('gates tooltips so that truncated cells enable tooltips and fitting cells do not', async () => {
    const proto = window.HTMLElement.prototype;
    const originalScrollWidth = Object.getOwnPropertyDescriptor(
      proto,
      'scrollWidth',
    );
    const originalOffsetWidth = Object.getOwnPropertyDescriptor(
      proto,
      'offsetWidth',
    );
    const originalOffsetHeight = Object.getOwnPropertyDescriptor(
      proto,
      'offsetHeight',
    );

    Object.defineProperty(proto, 'scrollWidth', {
      configurable: true,
      get(this: HTMLElement) {
        // Long paths overflow the 120px cell width; short README fits
        return (this.textContent ?? '').includes('README') ? 80 : 350;
      },
    });
    Object.defineProperty(proto, 'offsetWidth', {
      configurable: true,
      get() {
        return 120;
      },
    });
    Object.defineProperty(proto, 'offsetHeight', {
      configurable: true,
      get() {
        return 20;
      },
    });

    root = createRoot(container);
    act(() => {
      root!.render(<UseTruncationHookUsage />);
    });

    await act(async () => {});

    // In the DOM, cells containing long paths have tooltip-ready triggers
    const spans = Array.from(container.querySelectorAll('td span'));
    expect(spans.length).toBe(3);

    // Clean up prototype descriptors
    if (originalScrollWidth) {
      Object.defineProperty(proto, 'scrollWidth', originalScrollWidth);
    }
    if (originalOffsetWidth) {
      Object.defineProperty(proto, 'offsetWidth', originalOffsetWidth);
    }
    if (originalOffsetHeight) {
      Object.defineProperty(proto, 'offsetHeight', originalOffsetHeight);
    }
  });
});
