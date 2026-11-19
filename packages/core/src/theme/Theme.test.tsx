// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {hydrateRoot, type Root} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {act, render, cleanup} from '@testing-library/react';
import React from 'react';
import {declaredValue} from '../__tests__/stylexDeclarations';
import {Theme} from './Theme';
import {useTheme} from './useTheme';
import {defineTheme} from './defineTheme';
import type * as GenerateThemeRulesModule from './generateThemeRules';
import {dynamicTypeScaleRule} from './dynamicType';
import {__resetDevWarnings} from '../utils/devWarning';

const {generateThemeCSSSpy} = vi.hoisted(() => ({
  generateThemeCSSSpy: vi.fn(),
}));

vi.mock('./generateThemeRules', async importOriginal => {
  const actual = await importOriginal<typeof GenerateThemeRulesModule>();
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
    document.documentElement.removeAttribute('data-astryx-scheme');
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

  it("gives text inside that only inherits its size the theme's body size", () => {
    const {container} = render(
      <Theme theme={testTheme}>
        <span>child</span>
      </Theme>,
    );
    const wrapper = container.querySelector<HTMLElement>(
      '[data-astryx-theme="test"]',
    );
    expect(declaredValue(wrapper!, 'font-size')).toMatch(/--text-body-size/);
  });

  it("gives text inside that only inherits its line height the theme's body leading", () => {
    const {container} = render(
      <Theme theme={testTheme}>
        <span>child</span>
      </Theme>,
    );
    const wrapper = container.querySelector<HTMLElement>(
      '[data-astryx-theme="test"]',
    );
    expect(declaredValue(wrapper!, 'line-height')).toMatch(
      /--text-body-leading/,
    );
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

  it('names the scheme the root provider draws in on <html> when its mode or the page decides it, and removes it on unmount', async () => {
    for (const mode of ['dark', 'light'] as const) {
      const {unmount} = render(
        <Theme theme={testTheme} mode={mode}>
          <span>child</span>
        </Theme>,
      );
      expect(document.documentElement.getAttribute('data-astryx-scheme')).toBe(
        mode,
      );
      unmount();
      expect(document.documentElement.hasAttribute('data-astryx-scheme')).toBe(
        false,
      );
    }
    // A system root on a page whose scheme the engine does not report leaves
    // the reader's preference to decide.
    const unreported = render(
      <Theme theme={testTheme} mode="system">
        <span>child</span>
      </Theme>,
    );
    expect(document.documentElement.hasAttribute('data-astryx-scheme')).toBe(
      false,
    );
    unreported.unmount();
    // A system root on a page that names no scheme draws light, and on a
    // page that names both the reader's preference decides.
    const real = window.getComputedStyle.bind(window);
    let rootScheme = 'normal';
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      (element, pseudo) => {
        const style = real(element, pseudo);
        if (element === document.documentElement) {
          Object.defineProperty(style, 'colorScheme', {
            configurable: true,
            get: () => rootScheme,
          });
        }
        return style;
      },
    );
    try {
      // A nested Theme that forces dark never writes the root's scheme, not
      // even for a moment before the root writes its own.
      const written: (string | null)[] = [];
      const watcher = new MutationObserver(records => {
        for (const record of records) {
          if (record.attributeName === 'data-astryx-scheme') {
            written.push(
              document.documentElement.getAttribute('data-astryx-scheme'),
            );
          }
        }
      });
      watcher.observe(document.documentElement, {attributes: true});
      const page = render(
        <Theme theme={testTheme} mode="system">
          <Theme theme={testTheme} mode="dark">
            <span>child</span>
          </Theme>
        </Theme>,
      );
      await Promise.resolve();
      watcher.disconnect();
      expect(document.documentElement.getAttribute('data-astryx-scheme')).toBe(
        'light',
      );
      expect(written).not.toContain('dark');
      page.unmount();
      rootScheme = 'light dark';
      render(
        <Theme theme={testTheme} mode="system">
          <span>child</span>
        </Theme>,
      );
      expect(document.documentElement.hasAttribute('data-astryx-scheme')).toBe(
        false,
      );
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('names the page scheme again when the reader changes their preference, on a root that follows it through a media query', () => {
    const real = window.getComputedStyle.bind(window);
    let prefersDark = false;
    const query = Object.assign(new EventTarget(), {
      media: '(prefers-color-scheme: dark)',
      get matches() {
        return prefersDark;
      },
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
    });
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => query),
    );
    // The host's root follows the reader: `@media (prefers-color-scheme:
    // dark) {:root {color-scheme: dark}}`.
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      (element, pseudo) => {
        const style = real(element, pseudo);
        if (element === document.documentElement) {
          Object.defineProperty(style, 'colorScheme', {
            configurable: true,
            get: () => (prefersDark ? 'dark' : 'light'),
          });
        }
        return style;
      },
    );
    try {
      render(
        <Theme theme={testTheme} mode="system">
          <span>child</span>
        </Theme>,
      );
      expect(document.documentElement.getAttribute('data-astryx-scheme')).toBe(
        'light',
      );
      act(() => {
        prefersDark = true;
        query.dispatchEvent(new Event('change'));
      });
      expect(document.documentElement.getAttribute('data-astryx-scheme')).toBe(
        'dark',
      );
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
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

describe('the runtime injection hint', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // The hint a runtime theme logs, by its name.
  const hintFor = (name: string) => {
    __resetDevWarnings();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <Theme theme={defineTheme({name, tokens: {}})}>
        <div />
      </Theme>,
    );
    const message = warn.mock.calls
      .map(args => String(args[0]))
      .find(m => m.includes(`"${name}" is using runtime style injection`));
    expect(message, name).toBeDefined();
    return String(message);
  };

  it('gives the build step and invents no package or identifier from the name', () => {
    for (const name of ['canvas-editor', 'neutral']) {
      const message = hintFor(name);
      expect(message).toContain(
        'npx @astryxdesign/cli theme build <the file that defines it> --detail full',
      );
      expect(message).toContain(
        'use the import lines it prints for the built .js and .css',
      );
      expect(message).not.toContain('@astryxdesign/theme-');
      expect(message).not.toMatch(/import \{[^}]*\}/);
      expect(message).not.toContain(`${name}Theme`);
    }
  });
});

describe('a theme value that is not a defined theme', () => {
  const NOT_THEMES: ReadonlyArray<[string, unknown]> = [
    ['the mode string "light"', 'light'],
    ['the string "default"', 'default'],
    ['the mode string "system"', 'system'],
    ['an empty object', {}],
    ['null', null],
    ['undefined', undefined],
  ];

  /** Shows the theme name and mode a descendant reads. */
  function Probe() {
    const {name, mode} = useTheme();
    return <span data-testid="probe">{`${name} ${mode}`}</span>;
  }

  beforeEach(() => {
    __resetDevWarnings();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-astryx-theme');
    generateThemeCSSSpy.mockClear();
  });

  afterEach(() => {
    cleanup();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-astryx-theme');
  });

  for (const [label, value] of NOT_THEMES) {
    it(`renders ${label} in the browser with Core's default tokens, compiles nothing and warns once`, () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const {getByTestId, container} = render(
          <Theme theme={value as never} mode="dark">
            <Probe />
          </Theme>,
        );
        expect(getByTestId('probe').textContent).toBe('default dark');
        const wrapper = container.firstElementChild as HTMLElement;
        expect(wrapper.hasAttribute('data-astryx-theme')).toBe(false);
        expect(wrapper.getAttribute('data-theme')).toBe('dark');
        expect(document.documentElement.getAttribute('data-theme')).toBe(
          'dark',
        );
        expect(document.documentElement.hasAttribute('data-astryx-theme')).toBe(
          false,
        );
        expect(generateThemeCSSSpy).not.toHaveBeenCalled();
        const messages = warn.mock.calls
          .map(args => String(args[0]))
          .filter(m => m.includes('takes a theme from defineTheme()'));
        expect(messages).toHaveLength(1);
      } finally {
        warn.mockRestore();
      }
    });

    it(`renders ${label} the same on the server and in the browser`, () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const host = document.createElement('div');
      document.body.append(host);
      try {
        const ui = (
          <Theme theme={value as never} mode="light">
            <p>content</p>
          </Theme>
        );
        host.innerHTML = renderToString(ui);
        const serverMarkup = host.innerHTML;
        let root: Root | undefined;
        act(() => {
          root = hydrateRoot(host, ui);
        });
        expect(host.innerHTML).toBe(serverMarkup);
        expect(host.textContent).toBe('content');
        expect(error).not.toHaveBeenCalled();
        act(() => root?.unmount());
      } finally {
        host.remove();
        warn.mockRestore();
        error.mockRestore();
      }
    });
  }

  it('names the mode prop when the value is a mode', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      render(<Theme theme={'dark' as never}>x</Theme>);
      expect(String(warn.mock.calls[0]?.[0])).toBe(
        'Theme: `theme` takes a theme from defineTheme(), but got the string "dark". To set the color mode, use mode="dark". Until then, this Theme applies no theme of its own.',
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('keeps the theme around it when nested, and its own mode', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const {getByTestId} = render(
        <Theme theme={testTheme} mode="light">
          <Theme theme={'light' as never} mode="dark">
            <Probe />
          </Theme>
        </Theme>,
      );
      const probe = getByTestId('probe');
      expect(probe.textContent).toBe('test dark');
      expect(probe.parentElement?.getAttribute('data-astryx-theme')).toBe(
        'test',
      );
      expect(document.documentElement.getAttribute('data-astryx-theme')).toBe(
        'test',
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('keeps its mode for the Themes and readers below it when no theme surrounds it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const {getByTestId} = render(
        <Theme theme={'light' as never} mode="dark">
          <div data-testid="forced">
            <Probe />
          </div>
          <Theme theme={testTheme} mode="system">
            <div data-testid="system">
              <Probe />
            </div>
          </Theme>
          <Theme theme={{} as never} mode="light">
            <div data-testid="nested">
              <Probe />
            </div>
          </Theme>
        </Theme>,
      );
      expect(getByTestId('forced').textContent).toBe('default dark');
      // A system Theme under one that forces dark follows the reader's
      // preference (light here), not the forced root.
      expect(getByTestId('system').textContent).toBe('test light');
      expect(getByTestId('nested').textContent).toBe('default light');
    } finally {
      warn.mockRestore();
    }
  });

  it('warns for null and for a plain object separately', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      render(<Theme theme={null as never}>x</Theme>);
      render(<Theme theme={{} as never}>y</Theme>);
      const messages = warn.mock.calls
        .map(args => String(args[0]))
        .filter(m => m.includes('takes a theme from defineTheme()'));
      expect(messages).toHaveLength(2);
      expect(messages[0]).toContain('got null');
      expect(messages[1]).toContain(
        'an object that defineTheme() did not make',
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('applies a defined theme once the value becomes one, without remounting the subtree', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const {container, rerender} = render(
        <Theme theme={{} as never}>
          <input data-testid="kept" />
        </Theme>,
      );
      const input = container.querySelector('input');
      rerender(
        <Theme theme={testTheme}>
          <input data-testid="kept" />
        </Theme>,
      );
      expect(container.querySelector('input')).toBe(input);
      expect(
        (container.firstElementChild as HTMLElement).getAttribute(
          'data-astryx-theme',
        ),
      ).toBe('test');
      expect(generateThemeCSSSpy).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
