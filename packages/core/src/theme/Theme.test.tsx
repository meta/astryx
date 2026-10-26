// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, cleanup} from '@testing-library/react';
import React from 'react';
import {Theme} from './Theme';
import {defineTheme} from './defineTheme';
import type * as DefineThemeModule from './defineTheme';

const {generateThemeCSSSpy} = vi.hoisted(() => ({
  generateThemeCSSSpy: vi.fn(),
}));

vi.mock('./defineTheme', async importOriginal => {
  const actual = await importOriginal<typeof DefineThemeModule>();
  generateThemeCSSSpy.mockImplementation(actual.generateThemeCSS);
  return {...actual, generateThemeCSS: generateThemeCSSSpy};
});

const testTheme = defineTheme({
  name: 'test',
  tokens: {
    '--color-accent': ['#AA0000', '#FF5555'],
  },
});

const altTheme = defineTheme({
  name: 'alt',
  tokens: {
    '--color-accent': ['#00AA00', '#55FF55'],
  },
});

describe('Theme', () => {
  beforeEach(() => {
    // Clean up documentElement state before each test
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-astryx-theme');
    generateThemeCSSSpy.mockClear();
  });

  afterEach(() => {
    cleanup();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-astryx-theme');
  });

  it('renders children', () => {
    const {getByText} = render(
      <Theme theme={testTheme}>
        <span>hello</span>
      </Theme>,
    );
    expect(getByText('hello')).toBeTruthy();
  });

  it('mounts the remaining CSS when one authored declaration is dropped', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const theme = defineTheme({
        name: 'declaration-boundary',
        tokens: {'--color-accent': 'red; } body { color: red'},
        components: {button: {base: {borderRadius: '4px'}}},
      });
      render(
        <Theme theme={theme}>
          <span>child</span>
        </Theme>,
      );
      const css = Array.from(document.querySelectorAll('style'))
        .map(tag => tag.textContent ?? '')
        .join('\n');
      expect(css).not.toContain('body { color: red');
      expect(css).toContain('border-radius: 4px;');
      expect(css).toContain(':where(p)');
      expect(
        warn.mock.calls.filter(([message]) =>
          String(message).startsWith('[astryx theme] dropped'),
        ),
      ).toHaveLength(1);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('dropped "--color-accent" in tokens'),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('sets data-astryx-theme on wrapper div', () => {
    const {container} = render(
      <Theme theme={testTheme}>
        <span>child</span>
      </Theme>,
    );
    const wrapper = container.querySelector('[data-astryx-theme="test"]');
    expect(wrapper).toBeTruthy();
  });

  // =========================================================================
  // Root detection — data-theme on <html>
  // =========================================================================

  it('syncs data-theme to <html> for root provider in dark mode', () => {
    render(
      <Theme theme={testTheme} mode="dark">
        <span>child</span>
      </Theme>,
    );
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('syncs data-theme to <html> for root provider in light mode', () => {
    render(
      <Theme theme={testTheme} mode="light">
        <span>child</span>
      </Theme>,
    );
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('removes data-theme from <html> for root provider in system mode', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    render(
      <Theme theme={testTheme} mode="system">
        <span>child</span>
      </Theme>,
    );
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('removes data-theme from <html> when root provider unmounts', () => {
    const {unmount} = render(
      <Theme theme={testTheme} mode="dark">
        <span>child</span>
      </Theme>,
    );
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    unmount();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  // =========================================================================
  // Root detection — data-astryx-theme on <html>
  // =========================================================================

  it('syncs data-astryx-theme to <html> for root provider', () => {
    render(
      <Theme theme={testTheme} mode="light">
        <span>child</span>
      </Theme>,
    );
    expect(document.documentElement.getAttribute('data-astryx-theme')).toBe(
      'test',
    );
  });

  it('removes data-astryx-theme from <html> when root provider unmounts', () => {
    const {unmount} = render(
      <Theme theme={testTheme} mode="light">
        <span>child</span>
      </Theme>,
    );
    expect(document.documentElement.getAttribute('data-astryx-theme')).toBe(
      'test',
    );
    unmount();
    expect(document.documentElement.hasAttribute('data-astryx-theme')).toBe(
      false,
    );
  });

  // =========================================================================
  // Nested themes — should NOT sync to <html>
  // =========================================================================

  it('does not let nested Theme override <html> data-astryx-theme', () => {
    render(
      <Theme theme={testTheme} mode="dark">
        <Theme theme={altTheme} mode="light">
          <span>nested</span>
        </Theme>
      </Theme>,
    );
    // Root is "test" — nested "alt" should NOT override
    expect(document.documentElement.getAttribute('data-astryx-theme')).toBe(
      'test',
    );
  });

  it('does not let nested Theme override <html> data-theme', () => {
    render(
      <Theme theme={testTheme} mode="dark">
        <Theme theme={altTheme} mode="light">
          <span>nested</span>
        </Theme>
      </Theme>,
    );
    // Root is dark — nested light should NOT override
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('nested Theme still sets data-theme on its own wrapper div', () => {
    const {container} = render(
      <Theme theme={testTheme} mode="dark">
        <Theme theme={altTheme} mode="light">
          <span>nested</span>
        </Theme>
      </Theme>,
    );
    // The nested wrapper should have data-theme="light" on its own div
    const nestedWrapper = container.querySelector('[data-astryx-theme="alt"]');
    expect(nestedWrapper).toBeTruthy();
    expect(nestedWrapper?.getAttribute('data-theme')).toBe('light');
  });

  it('rebinds a default status role inside a nested theme that authors its source token', () => {
    const outer = defineTheme({
      name: 'status-role-outer',
      tokens: {
        '--color-text-blue': '#0074E2',
        '--color-text-info': '#0074E2',
      },
    });
    const inner = defineTheme({
      name: 'status-role-inner',
      tokens: {'--color-text-blue': '#A000C8'},
    });

    render(
      <Theme theme={outer}>
        <Theme theme={inner}>
          <span>nested</span>
        </Theme>
      </Theme>,
    );

    const innerCss = document.head.querySelector(
      'style[data-astryx-theme="status-role-inner"]',
    )?.textContent;
    expect(innerCss).toContain('--color-text-blue: #A000C8;');
    expect(innerCss).toContain('--color-text-info: var(--color-text-blue);');
  });

  // =========================================================================
  // Data token ownership — StyleX defaults, sparse Theme overrides
  // =========================================================================

  it('does not inject canonical data defaults', () => {
    render(
      <Theme theme={testTheme}>
        <span>child</span>
      </Theme>,
    );

    expect(
      document.head.querySelector('style[data-astryx-theme-base]'),
    ).toBeNull();
    const injected = Array.from(document.head.querySelectorAll('style'))
      .map(tag => tag.textContent ?? '')
      .join('\n');
    expect(injected).not.toContain('--color-data-');
    expect(injected).not.toContain(':root {');
  });

  it('injects only an authored data override inside the theme donut', () => {
    const theme = defineTheme({
      name: 'data-override',
      tokens: {'--color-data-categorical-blue': '#00A3FF'},
    });
    render(
      <Theme theme={theme}>
        <span>child</span>
      </Theme>,
    );

    const css = Array.from(
      document.head.querySelectorAll(
        'style[data-astryx-theme="data-override"]',
      ),
    )
      .map(tag => tag.textContent ?? '')
      .join('\n');
    expect(css).toContain('@layer reset, astryx-base, astryx-theme;');
    expect(css).toContain(
      '@scope ([data-astryx-theme="data-override"]) to ([data-astryx-theme])',
    );
    expect(css).toContain('--color-data-categorical-blue: #00A3FF;');
    expect(css.match(/--color-data-/g)).toHaveLength(1);
    expect(css).not.toContain(':root {');
  });

  it('lets a nested theme inherit an unspecified parent data override', () => {
    const parent = defineTheme({
      name: 'data-parent',
      tokens: {'--color-data-categorical-blue': '#00A3FF'},
    });
    const child = defineTheme({name: 'data-child'});
    render(
      <Theme theme={parent}>
        <Theme theme={child}>
          <span>nested</span>
        </Theme>
      </Theme>,
    );

    const parentCss = document.head.querySelector(
      'style[data-astryx-theme="data-parent"]',
    )?.textContent;
    const childCss = document.head.querySelector(
      'style[data-astryx-theme="data-child"]',
    )?.textContent;
    expect(parentCss).toContain('--color-data-categorical-blue: #00A3FF;');
    expect(childCss ?? '').not.toContain('--color-data-');
  });

  it('generates a theme once across nested and sibling mounts', () => {
    render(
      <Theme theme={testTheme}>
        <Theme theme={testTheme}>
          <span>nested</span>
        </Theme>
      </Theme>,
    );
    render(
      <Theme theme={testTheme}>
        <span>sibling</span>
      </Theme>,
    );

    expect(generateThemeCSSSpy).toHaveBeenCalledTimes(1);
    const injected = Array.from(document.querySelectorAll('style'))
      .map(tag => tag.textContent ?? '')
      .join('\n');
    expect(injected).toContain('@layer reset, astryx-base, astryx-theme;');
    expect(injected).not.toContain(':root {');
  });
});
