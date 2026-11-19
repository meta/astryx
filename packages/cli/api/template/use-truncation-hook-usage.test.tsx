// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useTruncation example demonstrates text truncation across table cells
 * with single-line and multi-line clamps.
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

    // The paths reach the DOM
    expect(container.textContent).toContain('build-20261103-120344');
    expect(container.textContent).toContain('reports/coverage');
    expect(container.textContent).toContain('README.md');
  });

  it('renders measured text elements across all table cells', async () => {
    root = createRoot(container);
    act(() => {
      root!.render(<UseTruncationHookUsage />);
    });

    await act(async () => {});

    // In the DOM, cells containing paths render span elements with truncation refs
    const spans = Array.from(container.querySelectorAll('td span'));
    expect(spans.length).toBe(3);
  });
});
