// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, vi, afterEach} from 'vitest';
import {render, renderHook, act, waitFor} from '@testing-library/react';
import React from 'react';
import {Theme} from './Theme';
import {defineTheme} from './defineTheme';
import {resetThemes} from './themeRegistry';
import {useTheme, useThemeName} from './useTheme';
import {useMediaQuery} from '../hooks/useMediaQuery';
import {resolveThemeTokens} from './tokens';

// Mock useMediaQuery — default to light mode
vi.mock('../hooks/useMediaQuery', () => ({
  useMediaQuery: vi.fn(() => false),
}));

const testTheme = defineTheme({
  name: 'test',
  tokens: {
    '--color-accent': ['#AA0000', '#FF5555'],
    '--spacing-4': '20px',
  },
});

function wrapper({
  children,
  mode,
}: {
  children: React.ReactNode;
  mode?: 'light' | 'dark' | 'system';
}) {
  return (
    <Theme theme={testTheme} mode={mode}>
      {children}
    </Theme>
  );
}

describe('useTheme', () => {
  it('returns defaults when used outside Theme', () => {
    const {result} = renderHook(() => useTheme());
    expect(result.current.name).toBe('default');
    // Should resolve default light-dark() tokens for light mode (useMediaQuery mocked to false = light)
    expect(result.current.token('--color-text-primary')).toBe('#0A1317');
    expect(result.current.token('--spacing-1')).toBe('0.25rem');
    expect(result.current.mode).toBe('light');
  });

  it('returns the theme name', () => {
    const {result} = renderHook(() => useTheme(), {
      wrapper: ({children}) => wrapper({children, mode: 'light'}),
    });
    expect(result.current.name).toBe('test');
  });

  it('resolves tuple tokens to light values in light mode', () => {
    const {result} = renderHook(() => useTheme(), {
      wrapper: ({children}) => wrapper({children, mode: 'light'}),
    });
    expect(result.current.token('--color-accent')).toBe('#AA0000');
  });

  it('resolves tuple tokens to dark values in dark mode', () => {
    const {result} = renderHook(() => useTheme(), {
      wrapper: ({children}) => wrapper({children, mode: 'dark'}),
    });
    expect(result.current.token('--color-accent')).toBe('#FF5555');
  });

  it('resolves single-value tokens unchanged', () => {
    const {result} = renderHook(() => useTheme(), {
      wrapper: ({children}) => wrapper({children, mode: 'light'}),
    });
    expect(result.current.token('--spacing-4')).toBe('20px');
  });

  it('falls back to defaults for tokens not in theme', () => {
    const {result} = renderHook(() => useTheme(), {
      wrapper: ({children}) => wrapper({children, mode: 'light'}),
    });
    // --spacing-1 is not overridden — should be the default '0.25rem'
    expect(result.current.token('--spacing-1')).toBe('0.25rem');
    expect(result.current.token('--border-width')).toBe('1px');
  });

  it('resolves --border-width override when defined in theme', () => {
    const arcadeTheme = defineTheme({
      name: 'arcade',
      tokens: {
        '--border-width': '2px',
      },
    });
    const {result} = renderHook(() => useTheme(), {
      wrapper: ({children}) => (
        <Theme theme={arcadeTheme} mode="light">
          {children}
        </Theme>
      ),
    });
    expect(result.current.token('--border-width')).toBe('2px');
  });

  it('resolves default light-dark() string tokens for the mode', () => {
    const {result} = renderHook(() => useTheme(), {
      wrapper: ({children}) => wrapper({children, mode: 'dark'}),
    });
    // --color-text-primary defaults to light-dark(#0A1317, #DFE2E5)
    expect(result.current.token('--color-text-primary')).toBe('#DFE2E5');
  });

  it('keeps the token resolver and return object stable across rerenders', () => {
    const {result, rerender} = renderHook(() => useTheme());
    const first = result.current;

    rerender();

    expect(result.current.token).toBe(first.token);
    expect(result.current).toBe(first);
  });

  it('returns empty string for unknown tokens', () => {
    const {result} = renderHook(() => useTheme(), {
      wrapper: ({children}) => wrapper({children, mode: 'light'}),
    });
    expect(result.current.token('--nonexistent')).toBe('');
  });

  it('exposes mode reflecting effective mode', () => {
    const {result} = renderHook(() => useTheme(), {
      wrapper: ({children}) => wrapper({children, mode: 'dark'}),
    });
    expect(result.current.mode).toBe('dark');
  });

  describe('modes outside light|dark|system', () => {
    // A persisted preference read back untyped can hand Theme a stale
    // string. It resolves like system, through the OS preference, never
    // as the string itself.
    afterEach(() => {
      vi.mocked(useMediaQuery).mockReturnValue(false);
    });

    it.each([
      ['banana', false, 'light'],
      ['DARK', false, 'light'],
      ['', false, 'light'],
      ['banana', true, 'dark'],
    ] as const)(
      'resolves "%s" like system (prefersDark=%s -> %s)',
      (value, prefersDark, expected) => {
        vi.mocked(useMediaQuery).mockReturnValue(prefersDark);
        const {result} = renderHook(() => useTheme(), {
          wrapper: ({children}) =>
            wrapper({children, mode: value as 'light' | 'dark' | 'system'}),
        });
        expect(result.current.mode).toBe(expected);
      },
    );
  });

  it('provides a tokens map with all resolved values', () => {
    const {result} = renderHook(() => useTheme(), {
      wrapper: ({children}) => wrapper({children, mode: 'light'}),
    });
    const tokens = result.current.tokens;
    expect(tokens['--color-accent']).toBe('#AA0000');
    expect(tokens['--spacing-4']).toBe('20px');
    expect(tokens['--spacing-1']).toBe('0.25rem');
  });

  it('uses the same token resolution as resolveThemeTokens', () => {
    const {result} = renderHook(() => useTheme(), {
      wrapper: ({children}) => wrapper({children, mode: 'dark'}),
    });

    expect(result.current.tokens).toEqual(
      resolveThemeTokens(testTheme, {mode: 'dark'}),
    );
  });

  it('resolves derived accent tokens to raw values, not var()/color-mix', () => {
    const brandTheme = defineTheme({name: 'brand', color: {accent: '#0064E0'}});
    const {result} = renderHook(() => useTheme(), {
      wrapper: ({children}) => (
        <Theme theme={brandTheme} mode="light">
          {children}
        </Theme>
      ),
    });

    const accent = result.current.token('--color-accent');
    expect(result.current.token('--color-text-accent')).toBe(accent);
    expect(result.current.token('--color-icon-accent')).toBe(accent);
    expect(result.current.token('--color-accent-muted')).toMatch(/^(#|rgb)/);
    expect(result.current.token('--color-accent-muted')).not.toContain('var(');
    expect(result.current.token('--color-accent-muted')).not.toContain(
      'color-mix',
    );
  });
});

// Covers the fallback used when a component calls useTheme() with no
// ThemeContext ancestor reachable — e.g. a detached tree (useToast's
// fallback viewport, other portals appended straight to document.body).
// Root Theme instances sync their mode to <html data-theme> specifically so
// this fallback can resolve the app's actual mode instead of jumping
// straight to OS preference (see Theme.tsx's useRootThemeSync).
describe('useTheme mode resolution without a ThemeContext ancestor', () => {
  afterEach(async () => {
    resetThemes();
    document.documentElement.removeAttribute('data-astryx-theme');
    // The hook from each `it` below is still mounted and subscribed to the
    // shared MutationObserver when this runs (RTL's own cleanup — which
    // unmounts it — is registered after this file's afterEach), so removing
    // the attribute here triggers a live state update; flush it inside act
    // so React doesn't warn about an update outside one.
    await act(async () => {
      document.documentElement.removeAttribute('data-theme');
    });
  });

  it('resolves mode from <html data-theme> when set', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const {result} = renderHook(() => useTheme());
    expect(result.current.mode).toBe('dark');
  });

  it('falls back to OS preference when <html data-theme> is absent', () => {
    // useMediaQuery is mocked to false (light) at the top of this file.
    const {result} = renderHook(() => useTheme());
    expect(result.current.mode).toBe('light');
  });

  it('stays live when <html data-theme> changes after mount', async () => {
    const {result} = renderHook(() => useTheme());
    expect(result.current.mode).toBe('light');

    act(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    await waitFor(() => expect(result.current.mode).toBe('dark'));
  });

  it('resolves registered theme tokens from <html data-astryx-theme> when set', () => {
    defineTheme({
      name: 'root-brand',
      tokens: {'--color-accent': ['#010203', '#AABBCC']},
    });
    document.documentElement.setAttribute('data-astryx-theme', 'root-brand');
    document.documentElement.setAttribute('data-theme', 'dark');

    const {result} = renderHook(() => useTheme());

    expect(result.current.name).toBe('root-brand');
    expect(result.current.token('--color-accent')).toBe('#AABBCC');
  });

  it('stays live when <html data-astryx-theme> changes after mount', async () => {
    defineTheme({
      name: 'first-brand',
      tokens: {'--color-accent': '#111111'},
    });
    defineTheme({
      name: 'second-brand',
      tokens: {'--color-accent': '#222222'},
    });
    document.documentElement.setAttribute('data-astryx-theme', 'first-brand');

    const {result} = renderHook(() => useTheme());
    expect(result.current.name).toBe('first-brand');
    expect(result.current.token('--color-accent')).toBe('#111111');

    act(() => {
      document.documentElement.setAttribute(
        'data-astryx-theme',
        'second-brand',
      );
    });

    await waitFor(() => expect(result.current.name).toBe('second-brand'));
    expect(result.current.token('--color-accent')).toBe('#222222');
  });
});

// Covers the singleton MutationObserver + no-op gating in useRootThemeModeAttr:
// provider-path consumers (a ThemeContext ancestor is reachable) must not
// create an observer or react to <html data-theme> at all, and every
// no-context consumer must share exactly one observer, refcounted down to
// zero as they unmount.
describe('useTheme root-attribute observer lifecycle', () => {
  afterEach(() => {
    resetThemes();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-astryx-theme');
    // vi.stubGlobal'd MutationObserver stubs below are torn down here even if
    // a test fails partway through, instead of relying on a manual restore
    // line at the end of each test that a mid-test throw would skip.
    vi.unstubAllGlobals();
  });

  it('creates no observer and does not re-render provider-path consumers when <html data-theme> changes', () => {
    const ObserverSpy = vi.fn();
    vi.stubGlobal('MutationObserver', ObserverSpy);

    const renders = {count: 0};
    function Consumer() {
      useTheme();
      renders.count++;
      return null;
    }

    render(
      <Theme theme={testTheme} mode="light">
        <Consumer />
      </Theme>,
    );

    expect(ObserverSpy).not.toHaveBeenCalled();

    const before = renders.count;
    act(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    expect(renders.count).toBe(before);
  });

  it('creates no observer under a page-root Theme that applies no theme and forces a mode', () => {
    const ObserverSpy = vi.fn();
    vi.stubGlobal('MutationObserver', ObserverSpy);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const seen: string[] = [];
      function Consumer() {
        const {name, mode} = useTheme();
        const rootName = useThemeName();
        seen.push(`${name} ${mode} ${rootName ?? 'none'}`);
        return null;
      }
      render(
        <Theme theme={'light' as never} mode="dark">
          <Theme theme={{} as never} mode="dark">
            <Consumer />
          </Theme>
        </Theme>,
      );
      expect(ObserverSpy).not.toHaveBeenCalled();
      expect(seen.at(-1)).toBe('default dark none');
    } finally {
      warn.mockRestore();
    }
  });

  it('shares one observer across multiple no-context consumers and disconnects once all unmount', () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    const ObserverSpy = vi.fn().mockImplementation(function () {
      return {observe, disconnect};
    });
    vi.stubGlobal('MutationObserver', ObserverSpy);

    const first = renderHook(() => useTheme());
    const second = renderHook(() => useTheme());

    // <html data-theme>, <html data-astryx-theme>, and the root's scheme for
    // 'system' (the root's attributes and the head).
    expect(ObserverSpy).toHaveBeenCalledTimes(3);
    expect(observe).toHaveBeenCalledTimes(4);

    first.unmount();
    expect(disconnect).not.toHaveBeenCalled();

    second.unmount();
    expect(disconnect).toHaveBeenCalledTimes(3);
  });
});

describe('useTheme system follows the page root', () => {
  /** What the page root's computed `color-scheme` names. */
  let rootScheme = '';

  function stubRootScheme(): void {
    const real = window.getComputedStyle.bind(window);
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
  }

  afterEach(() => {
    rootScheme = '';
    vi.mocked(useMediaQuery).mockReturnValue(false);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetThemes();
    for (const node of document.head.querySelectorAll('[data-probe]')) {
      node.remove();
    }
  });

  it('resolves system to the one scheme the page root names', () => {
    rootScheme = 'dark';
    stubRootScheme();
    const {result} = renderHook(() => useTheme(), {
      wrapper: ({children}) => wrapper({children, mode: 'system'}),
    });
    expect(result.current.mode).toBe('dark');
    expect(result.current.token('--color-accent')).toBe('#FF5555');
  });

  it('resolves system to light when the root names no scheme, as the page draws', () => {
    rootScheme = 'normal';
    stubRootScheme();
    vi.mocked(useMediaQuery).mockReturnValue(true);
    const {result} = renderHook(() => useTheme(), {
      wrapper: ({children}) => wrapper({children, mode: 'system'}),
    });
    expect(result.current.mode).toBe('light');
  });

  it('reads the color-scheme meta when the root names no scheme, as the browser does', () => {
    rootScheme = 'normal';
    stubRootScheme();
    vi.mocked(useMediaQuery).mockReturnValue(true);
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'color-scheme');
    meta.setAttribute('data-probe', '');
    document.head.append(meta);
    for (const [content, mode] of [
      ['light dark', 'dark'],
      ['dark', 'dark'],
      ['only light', 'light'],
      ['normal', 'light'],
    ] as const) {
      meta.setAttribute('content', content);
      const {result, unmount} = renderHook(() => useTheme(), {
        wrapper: ({children}) => wrapper({children, mode: 'system'}),
      });
      expect(result.current.mode, content).toBe(mode);
      unmount();
    }
  });

  it('takes the first color-scheme meta that names a scheme, as the browser does', () => {
    rootScheme = 'normal';
    stubRootScheme();
    vi.mocked(useMediaQuery).mockReturnValue(false);
    for (const content of ['', 'dark']) {
      const meta = document.createElement('meta');
      meta.setAttribute('name', 'color-scheme');
      meta.setAttribute('content', content);
      meta.setAttribute('data-probe', '');
      document.head.append(meta);
    }
    const {result} = renderHook(() => useTheme(), {
      wrapper: ({children}) => wrapper({children, mode: 'system'}),
    });
    expect(result.current.mode).toBe('dark');
  });

  it('leaves the preference to decide when the root names both schemes, or the engine reports none', () => {
    stubRootScheme();
    for (const scheme of ['light dark', '']) {
      rootScheme = scheme;
      vi.mocked(useMediaQuery).mockReturnValue(true);
      const dark = renderHook(() => useTheme(), {
        wrapper: ({children}) => wrapper({children, mode: 'system'}),
      });
      expect(dark.result.current.mode).toBe('dark');
      dark.unmount();
      vi.mocked(useMediaQuery).mockReturnValue(false);
      const light = renderHook(() => useTheme(), {
        wrapper: ({children}) => wrapper({children, mode: 'system'}),
      });
      expect(light.result.current.mode).toBe('light');
      light.unmount();
    }
  });

  it('ignores the root under a Theme that forces light or dark, and follows the preference', () => {
    rootScheme = 'dark';
    stubRootScheme();
    const {result} = renderHook(() => useTheme(), {
      wrapper: ({children}) => (
        <Theme theme={testTheme} mode="light">
          <Theme theme={testTheme} mode="system">
            <Theme theme={testTheme} mode="system">
              {children}
            </Theme>
          </Theme>
        </Theme>
      ),
    });
    expect(result.current.mode).toBe('light');
  });

  it('reads the root again when a stylesheet in the head changes it', async () => {
    stubRootScheme();
    const {result} = renderHook(() => useTheme(), {
      wrapper: ({children}) => wrapper({children, mode: 'system'}),
    });
    expect(result.current.mode).toBe('light');
    rootScheme = 'dark';
    act(() => {
      const style = document.createElement('style');
      style.setAttribute('data-probe', '');
      style.textContent = ':root { color-scheme: dark; }';
      document.head.append(style);
    });
    await waitFor(() => expect(result.current.mode).toBe('dark'));
  });

  it('reads the root again when a linked stylesheet loads, and when a stylesheet link changes', async () => {
    stubRootScheme();
    const {result} = renderHook(() => useTheme(), {
      wrapper: ({children}) => wrapper({children, mode: 'system'}),
    });
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'host.css';
    link.setAttribute('data-probe', '');
    act(() => {
      document.head.append(link);
    });
    // The sheet applies when it loads, not when its element arrives.
    expect(result.current.mode).toBe('light');
    rootScheme = 'dark';
    act(() => {
      link.dispatchEvent(new Event('load'));
    });
    await waitFor(() => expect(result.current.mode).toBe('dark'));
    rootScheme = '';
    act(() => {
      link.media = 'print';
    });
    await waitFor(() => expect(result.current.mode).toBe('light'));
    link.remove();
  });

  it('shares one observer across system consumers, and disconnects it after the last', () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    const ObserverSpy = vi.fn().mockImplementation(function () {
      return {observe, disconnect};
    });
    vi.stubGlobal('MutationObserver', ObserverSpy);
    function Consumer() {
      useTheme();
      return null;
    }
    const {rerender, unmount} = render(
      <Theme theme={testTheme} mode="system">
        <Consumer />
        <Consumer />
      </Theme>,
    );
    expect(ObserverSpy).toHaveBeenCalledTimes(1);
    // The root's attributes and the head.
    expect(observe).toHaveBeenCalledTimes(2);
    rerender(
      <Theme theme={testTheme} mode="system">
        <Consumer />
      </Theme>,
    );
    expect(disconnect).not.toHaveBeenCalled();
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('creates no observer for a system consumer under a forced Theme', () => {
    const ObserverSpy = vi.fn();
    vi.stubGlobal('MutationObserver', ObserverSpy);
    renderHook(() => useTheme(), {
      wrapper: ({children}) => (
        <Theme theme={testTheme} mode="dark">
          <Theme theme={testTheme} mode="system">
            {children}
          </Theme>
        </Theme>
      ),
    });
    expect(ObserverSpy).not.toHaveBeenCalled();
  });
});
