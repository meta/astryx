// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useTruncation example shows a tooltip with the full path only on cells
 * whose text is actually cut off: the long single-line path truncates and
 * carries the tooltip, the short path fits and carries none.
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
  it('renders the narrow path column with the three fixture rows', () => {
    root = createRoot(container);
    act(() => root!.render(<UseTruncationHookUsage />));
    const cells = Array.from(container.querySelectorAll('td')).map(
      cell => cell.textContent ?? '',
    );
    expect(cells).toContain('build');
    expect(cells).toContain('bundle');
    expect(cells).toContain('readme');
    // The long paths the fixture carries reach the DOM (clamped visually).
    expect(container.textContent).toContain('build-20261103-120344');
  });
});
