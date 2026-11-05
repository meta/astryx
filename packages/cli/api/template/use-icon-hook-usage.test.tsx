// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useIcon example renders one status row under the current theme and under
 * a Theme that overrides the success, warning and error icons. The row's icons
 * follow the theme with no change to the row. It renders under an app's root
 * Theme, as on the docs site.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {Theme, defineTheme} from '@astryxdesign/core/theme';
import UseIconHookUsage from '../../assets/templates/blocks/components/Icon/useIconHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

const appTheme = defineTheme({name: 'use-icon-test-app'});

let root: Root | null = null;
let container: HTMLElement;

function rowIcons(caption: string): SVGElement[] {
  const label = Array.from(container.querySelectorAll('span')).find(
    span => span.textContent === caption,
  );
  const section = label?.parentElement;
  if (section == null) {
    throw new Error(`no status row captioned "${caption}"`);
  }
  return Array.from(section.querySelectorAll('svg'));
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(
      <Theme theme={appTheme}>
        <UseIconHookUsage />
      </Theme>,
    );
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe('useIcon example', () => {
  it('draws the built-in status icons under the current theme', () => {
    const icons = rowIcons('Current theme');
    expect(icons).toHaveLength(3);
    for (const icon of icons) {
      expect(icon.getAttribute('data-slot')).toBeNull();
    }
  });

  it("draws the overriding Theme's icons in the same row component", () => {
    const icons = rowIcons('Theme with its own status icons');
    expect(icons).toHaveLength(3);
    for (const icon of icons) {
      expect(icon.getAttribute('data-slot')).toBe('icon');
    }
    expect(icons.map(icon => icon.innerHTML)).not.toEqual(
      rowIcons('Current theme').map(icon => icon.innerHTML),
    );
  });

  it("keeps the page's color mode inside the overriding Theme", () => {
    act(() =>
      root?.render(
        <Theme theme={appTheme} mode="dark">
          <UseIconHookUsage />
        </Theme>,
      ),
    );
    const nested = container.querySelector(
      '[data-astryx-theme="status-icons-docs"]',
    );
    expect(nested?.getAttribute('data-theme')).toBe('dark');
  });
});
