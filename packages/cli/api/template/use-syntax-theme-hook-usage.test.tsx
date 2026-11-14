// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useSyntaxTheme example paints a word with the keyword color of the
 * syntax theme around it.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import UseSyntaxThemeHookUsage from '../../assets/templates/blocks/components/SyntaxTheme/useSyntaxThemeHookUsage';

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
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UseSyntaxThemeHookUsage />);
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.unstubAllGlobals();
});

describe('useSyntaxTheme example', () => {
  it('paints the keyword with the syntax theme color', () => {
    const word = container.querySelector('svg[role="img"] text');
    expect(word?.textContent?.trim()).toBe('const');
    expect(word?.getAttribute('direction')).toBe('ltr');
    expect(word?.getAttribute('fill')).toBe('#cf222e');
  });
});
