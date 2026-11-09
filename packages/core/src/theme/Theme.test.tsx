// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {hydrateRoot, type Root} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {act, render, cleanup} from '@testing-library/react';
import React from 'react';
import {Theme} from './Theme';
import {defineTheme} from './defineTheme';
import type * as DefineThemeModule from './defineTheme';
import {dynamicTypeScaleRule} from './dynamicType';

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
  // The gate is the capability alone, never a platform idiom (one touch
  // behavior on every touch device): a touch callout without
  // `font: -apple-system-body` measures nothing, and every scale reads
  // `env(preferred-text-scale)`.
  it('measures no text size where the engine has no font: -apple-system-body, and reads env(preferred-text-scale)', () => {
    vi.stubGlobal('CSS', {
      supports: vi.fn(
        (property: string) => property === '-webkit-touch-callout',
      ),
    });
    vi.stubGlobal(
      'CSSStyleSheet',
      class {
        text = '';
        replaceSync(text: string) {
          this.text = text;
        }
      },
    );
    Object.defineProperty(document, 'adoptedStyleSheets', {
      configurable: true,
      writable: true,
      value: [],
    });
    let unmount = () => {};
    try {
      ({unmount} = render(
        <Theme theme={testTheme}>
          <span>web</span>
        </Theme>,
      ));
      expect(
        document.querySelector('[data-astryx-text-size-probe]'),
      ).toBeNull();
      const adopted = (
        document.adoptedStyleSheets as unknown as {text: string}[]
      )
        .map(sheet => sheet.text)
        .join('');
      expect(adopted).toContain('env(preferred-text-scale, 1)');
    } finally {
      unmount();
      vi.unstubAllGlobals();
      delete (document as {adoptedStyleSheets?: unknown}).adoptedStyleSheets;
    }
  });

  it('keeps the page on the reader text size wherever the engine provides it, from the root Theme only, with nothing on <html>', () => {
    // The capability and nothing else: no touch callout.
    vi.stubGlobal('CSS', {
      supports: vi.fn(
        (property: string, value?: string) =>
          property === 'font' && value === '-apple-system-body',
      ),
    });
    class FakeSheet {
      text = '';
      replaceSync(text: string) {
        this.text = text;
      }
    }
    vi.stubGlobal('CSSStyleSheet', FakeSheet);
    Object.defineProperty(document, 'adoptedStyleSheets', {
      configurable: true,
      writable: true,
      value: [],
    });
    const adoptedText = () =>
      (document.adoptedStyleSheets as unknown as FakeSheet[])
        .map(sheet => sheet.text)
        .join('');
    const real = window.getComputedStyle.bind(window);
    const computed = vi
      .spyOn(window, 'getComputedStyle')
      .mockImplementation(element =>
        element instanceof HTMLElement &&
        element.hasAttribute('data-astryx-text-size-probe')
          ? ({fontSize: '33px'} as CSSStyleDeclaration)
          : real(element),
      );
    const before = document.documentElement.getAttributeNames();
    try {
      const {unmount} = render(
        <Theme theme={testTheme}>
          <Theme theme={altTheme}>
            <span>nested</span>
          </Theme>
        </Theme>,
      );
      // Body at 33px is the second accessibility size; its scales reach the
      // page through an adopted stylesheet, from the root Theme alone.
      expect(adoptedText()).toBe(dynamicTypeScaleRule('ax2'));
      expect(
        document.querySelectorAll('[data-astryx-text-size-probe]'),
      ).toHaveLength(1);
      expect(
        document.documentElement
          .getAttributeNames()
          .filter(name => name.includes('text-size')),
      ).toEqual([]);

      unmount();
      expect(adoptedText()).toBe('');
      expect(
        document.querySelector('[data-astryx-text-size-probe]'),
      ).toBeNull();
      expect(document.documentElement.getAttributeNames()).toEqual(before);
    } finally {
      vi.unstubAllGlobals();
      computed.mockRestore();
      delete (document as {adoptedStyleSheets?: unknown}).adoptedStyleSheets;
    }
  });

  it('keeps the shared CSS until the last Theme using it unmounts', () => {
    function App({showInner}: {showInner: boolean}) {
      return (
        <Theme theme={testTheme}>
          <span>outer</span>
          {showInner && (
            <Theme theme={testTheme}>
              <span>inner</span>
            </Theme>
          )}
        </Theme>
      );
    }
    const selector = 'style[data-astryx-theme="test"]';
    const {rerender, unmount} = render(<App showInner={true} />);
    expect(document.head.querySelector(selector)).not.toBeNull();

    // The inner Theme injected first (effects commit children before
    // parents); its unmount must not strip the CSS the outer one still needs.
    rerender(<App showInner={false} />);
    expect(document.head.querySelector(selector)).not.toBeNull();

    // Re-adding an instance reuses the shared CSS without regenerating it.
    rerender(<App showInner={true} />);
    expect(generateThemeCSSSpy).toHaveBeenCalledTimes(1);
    expect(document.head.querySelectorAll(selector)).toHaveLength(1);

    // The last instance leaving removes it.
    unmount();
    expect(document.head.querySelector(selector)).toBeNull();
  });

  it('keeps the original CSS while an edited same-name theme mounts inside it and after it unmounts', () => {
    const edited = defineTheme({
      name: 'test',
      tokens: {
        '--color-accent': ['#0000AA', '#5555FF'],
      },
    });
    function App({showEdited}: {showEdited: boolean}) {
      return (
        <Theme theme={testTheme}>
          {showEdited && (
            <Theme theme={edited}>
              <span>preview</span>
            </Theme>
          )}
        </Theme>
      );
    }
    const selector = 'style[data-astryx-theme="test"]';
    const {rerender, unmount} = render(<App showEdited={false} />);
    expect(document.head.querySelector(selector)?.textContent).toMatch(
      /#aa0000/i,
    );

    // A preview of the edited copy mounts inside the original. The first
    // Theme that injected the name keeps its CSS in the document.
    rerender(<App showEdited={true} />);
    expect(document.head.querySelectorAll(selector)).toHaveLength(1);
    expect(document.head.querySelector(selector)?.textContent).toMatch(
      /#aa0000/i,
    );

    rerender(<App showEdited={false} />);
    const styles = document.head.querySelectorAll(selector);
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toMatch(/#aa0000/i);

    unmount();
    expect(document.head.querySelector(selector)).toBeNull();
  });

  it('keeps the CSS for one root when a Theme in another root with the same id unmounts', () => {
    const selector = 'style[data-astryx-theme="test"]';
    const first = document.createElement('div');
    const second = document.createElement('div');
    document.body.append(first, second);
    // Hydrated roots derive useId from tree position, so both Themes get
    // the same id.
    const ui = <Theme theme={testTheme}>content</Theme>;
    first.innerHTML = renderToString(ui);
    second.innerHTML = renderToString(ui);
    let rootA: Root | undefined;
    let rootB: Root | undefined;
    act(() => {
      rootA = hydrateRoot(first, ui);
    });
    act(() => {
      rootB = hydrateRoot(second, ui);
    });
    expect(document.head.querySelectorAll(selector)).toHaveLength(1);

    act(() => rootB?.unmount());
    expect(document.head.querySelector(selector)).not.toBeNull();

    act(() => rootA?.unmount());
    expect(document.head.querySelector(selector)).toBeNull();
    first.remove();
    second.remove();
  });

  it("paints the owning Theme's new definition when only its theme changes", () => {
    const edited = defineTheme({
      name: 'test',
      tokens: {
        '--color-accent': ['#0000AA', '#5555FF'],
      },
    });
    function App({ownerTheme}: {ownerTheme: typeof testTheme}) {
      return (
        <>
          <Theme theme={ownerTheme}>
            <span>owner</span>
          </Theme>
          <Theme theme={testTheme}>
            <span>other</span>
          </Theme>
        </>
      );
    }
    const selector = 'style[data-astryx-theme="test"]';
    const {rerender, unmount} = render(<App ownerTheme={testTheme} />);
    expect(document.head.querySelector(selector)?.textContent).toMatch(
      /#aa0000/i,
    );

    // The first Theme owns the CSS. Its own theme changes; the other keeps
    // the original. As on main, the owner's new definition paints.
    rerender(<App ownerTheme={edited} />);
    const styles = document.head.querySelectorAll(selector);
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toMatch(/#0000aa/i);

    unmount();
    expect(document.head.querySelector(selector)).toBeNull();
  });

  it('replaces the shared CSS when a theme is redefined under the same name', () => {
    const redefined = defineTheme({
      name: 'test',
      tokens: {
        '--color-accent': ['#0000AA', '#5555FF'],
      },
    });
    function App({theme}: {theme: typeof testTheme}) {
      return (
        <Theme theme={theme}>
          <Theme theme={theme}>
            <span>inner</span>
          </Theme>
        </Theme>
      );
    }
    const selector = 'style[data-astryx-theme="test"]';
    const {rerender, unmount} = render(<App theme={testTheme} />);
    expect(document.head.querySelector(selector)?.textContent).toMatch(
      /#aa0000/i,
    );

    rerender(<App theme={redefined} />);
    const styles = document.head.querySelectorAll(selector);
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toMatch(/#0000aa/i);
    expect(styles[0].textContent).not.toMatch(/#aa0000/i);

    unmount();
    expect(document.head.querySelector(selector)).toBeNull();
  });
});
