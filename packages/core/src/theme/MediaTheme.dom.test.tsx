// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MediaTheme.dom.test.tsx
 * @input MediaTheme rendered in jsdom
 * @output Coverage for mode="auto" and mode="off" DOM behavior
 * @position Companion to useAutoMediaMode.test.ts, which covers the pure pick
 *
 * jsdom applies no stylesheet and resolves no custom properties, so auto
 * cannot measure here — which makes this the right place to pin the fallback
 * behavior that an unmeasurable surface depends on.
 *
 * Named `.dom.test.tsx` rather than `.test.tsx`: a sibling `.test.ts` of the
 * same basename collides in the TypeScript project service, and type-aware
 * lint then cannot resolve either file.
 */

import {describe, it, expect, vi} from 'vitest';
import type {CSSProperties} from 'react';
import {act, render, screen} from '@testing-library/react';
import {Theme} from './Theme';
import {defineTheme} from './defineTheme';
import {MediaTheme} from './MediaTheme';
import type {MediaThemeMode} from './MediaTheme';

function renderMode(mode: MediaThemeMode, fallback?: 'dark' | 'light') {
  render(
    <div style={{background: 'rgb(10, 19, 23)'}}>
      <MediaTheme mode={mode} fallback={fallback}>
        <span data-testid="child">content</span>
      </MediaTheme>
    </div>,
  );
  return screen.getByTestId('child').parentElement;
}

describe('MediaTheme', () => {
  const reactiveTheme = defineTheme({name: 'media-reactive'});

  function watchReactiveSurface(isDark: () => boolean) {
    const computedStyle = window.getComputedStyle;
    return vi.spyOn(window, 'getComputedStyle').mockImplementation(element => {
      const style = computedStyle(element);
      if (
        element instanceof HTMLElement &&
        element.dataset.testid === 'reactive-surface'
      ) {
        style.backgroundColor = isDark()
          ? 'rgb(255, 255, 255)'
          : 'rgb(0, 0, 0)';
        style.backgroundImage = 'none';
      }
      if (
        element.tagName === 'SPAN' &&
        element instanceof HTMLElement &&
        element.style.color.startsWith('var(')
      ) {
        style.color =
          element.style.color.includes('--color-on-dark') ||
          (element.style.color.includes('--color-text-primary') && isDark())
            ? 'rgb(255, 255, 255)'
            : 'rgb(0, 0, 0)';
      }
      return style;
    });
  }

  it('updates auto mode when Theme mode changes around stable children', () => {
    const stableChild = (
      <div data-testid="reactive-surface">
        <MediaTheme mode="auto">stable</MediaTheme>
      </div>
    );
    const spy = watchReactiveSurface(
      () => document.querySelector('[data-theme="dark"]') !== null,
    );
    try {
      const {container, rerender} = render(
        <Theme theme={reactiveTheme} mode="light">
          {stableChild}
        </Theme>,
      );
      expect(
        container.querySelector('[data-astryx-media="dark"]'),
      ).not.toBeNull();
      rerender(
        <Theme theme={reactiveTheme} mode="dark">
          {stableChild}
        </Theme>,
      );
      expect(
        container.querySelector('[data-astryx-media="light"]'),
      ).not.toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it('updates auto mode when OS preference changes without a parent render', () => {
    let matches = false;
    const listeners = new Set<() => void>();
    const preference = vi
      .spyOn(window, 'matchMedia')
      .mockImplementation(query => ({
        media: query,
        get matches() {
          return query === '(prefers-color-scheme: dark)' && matches;
        },
        onchange: null,
        addEventListener: (_event: string, listener: unknown) => {
          listeners.add(listener as () => void);
        },
        removeEventListener: (_event: string, listener: unknown) => {
          listeners.delete(listener as () => void);
        },
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => true,
      }));
    const spy = watchReactiveSurface(() => matches);
    try {
      const {container, unmount} = render(
        <div data-testid="reactive-surface">
          <MediaTheme mode="auto">stable OS</MediaTheme>
        </div>,
      );
      expect(
        container.querySelector('[data-astryx-media="dark"]'),
      ).not.toBeNull();
      act(() => {
        matches = true;
        listeners.forEach(listener => listener());
      });
      expect(
        container.querySelector('[data-astryx-media="light"]'),
      ).not.toBeNull();
      unmount();
    } finally {
      spy.mockRestore();
      preference.mockRestore();
    }
  });

  it('follows forced root data-theme mode outside any Theme', async () => {
    const root = document.documentElement;
    const previous = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'light');
    const spy = watchReactiveSurface(
      () => root.getAttribute('data-theme') === 'dark',
    );
    try {
      const {container, unmount} = render(
        <div data-testid="reactive-surface">
          <MediaTheme mode="auto">detached root</MediaTheme>
        </div>,
      );
      expect(
        container.querySelector('[data-astryx-media="dark"]'),
      ).not.toBeNull();
      await act(async () => {
        root.setAttribute('data-theme', 'dark');
        await Promise.resolve();
      });
      expect(
        container.querySelector('[data-astryx-media="light"]'),
      ).not.toBeNull();
      expect(
        spy.mock.calls.filter(([element]) => element === root),
      ).toHaveLength(0);
      unmount();
    } finally {
      spy.mockRestore();
      if (previous === null) {
        root.removeAttribute('data-theme');
      } else {
        root.setAttribute('data-theme', previous);
      }
    }
  });

  function surfaces(
    ambient: string,
    count = 20,
    mode: MediaThemeMode = 'auto',
  ) {
    return Array.from({length: count}, (_, i) => (
      <div
        key={i}
        style={
          {
            backgroundColor: 'rgb(0, 0, 0)',
            backgroundImage: 'none',
            color: 'rgb(17, 18, 19)',
            colorScheme: 'light dark',
            '--color-text-primary': ambient,
            '--color-on-dark': 'rgb(255, 255, 255)',
            '--color-on-light': 'rgb(0, 0, 0)',
          } as CSSProperties
        }>
        <MediaTheme mode={mode}>row {i}</MediaTheme>
      </div>
    ));
  }

  function watchProbes() {
    const computedStyle = window.getComputedStyle;
    return vi.spyOn(window, 'getComputedStyle').mockImplementation(element => {
      const style = computedStyle(element);
      if (element.tagName === 'SPAN' && element instanceof HTMLElement) {
        const token = element.style.color.match(/^var\((.*)\)$/)?.[1];
        if (token !== undefined) {
          style.color = computedStyle(element.parentElement!).getPropertyValue(
            token,
          );
        }
      }
      return style;
    });
  }

  it('re-probes when the preferred scheme changes with the same token text', () => {
    let matches = false;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const preference = vi
      .spyOn(window, 'matchMedia')
      .mockReturnValue(
        Object.defineProperty(query, 'matches', {get: () => matches}),
      );
    const spy = watchProbes();
    try {
      const {rerender} = render(<>{surfaces('rgb(4, 5, 6)', 1)}</>);
      expect(
        spy.mock.calls.filter(([el]) => el.tagName === 'SPAN'),
      ).toHaveLength(3);
      matches = true;
      rerender(<>{surfaces('rgb(4, 5, 6)', 1)}</>);
      expect(
        spy.mock.calls.filter(([el]) => el.tagName === 'SPAN'),
      ).toHaveLength(6);
    } finally {
      matches = false;
      spy.mockRestore();
      preference.mockRestore();
    }
  });

  it('shares one probe across identical contexts and skips writes on re-render', () => {
    const spy = watchProbes();
    try {
      const {rerender} = render(<>{surfaces('rgb(1, 2, 3)')}</>);
      const probes = () =>
        spy.mock.calls.filter(([el]) => el.tagName === 'SPAN');
      expect(probes()).toHaveLength(3);
      rerender(<>{surfaces('rgb(1, 2, 3)')}</>);
      expect(probes()).toHaveLength(3);
    } finally {
      spy.mockRestore();
    }
  });

  it('re-probes and re-picks when a token changes', () => {
    const spy = watchProbes();
    try {
      const {container, rerender} = render(<>{surfaces('rgb(2, 3, 4)', 1)}</>);
      expect(
        container.querySelector('[data-astryx-media="dark"]'),
      ).not.toBeNull();
      rerender(<>{surfaces('rgb(254, 253, 252)', 1)}</>);
      expect(container.querySelector('[data-astryx-media]')).toBeNull();
      expect(
        spy.mock.calls.filter(([el]) => el.tagName === 'SPAN'),
      ).toHaveLength(6);
    } finally {
      spy.mockRestore();
    }
  });

  it('skips unchanged missing tokens locally but does not share their results', () => {
    const spy = watchProbes();
    try {
      const {rerender} = render(<>{surfaces('', 1)}</>);
      const initial = spy.mock.calls.filter(
        ([el]) => el.tagName === 'SPAN',
      ).length;
      expect(initial).toBe(3);
      rerender(<>{surfaces('', 1)}</>);
      expect(
        spy.mock.calls.filter(([el]) => el.tagName === 'SPAN'),
      ).toHaveLength(initial);
      rerender(<>{surfaces('', 2)}</>);
      expect(
        spy.mock.calls.filter(([el]) => el.tagName === 'SPAN'),
      ).toHaveLength(initial + 3);
    } finally {
      spy.mockRestore();
    }
  });

  it('does not measure an explicit dark instance', () => {
    const spy = watchProbes();
    try {
      render(<>{surfaces('rgb(3, 4, 5)', 1, 'dark')}</>);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it.each(['dark', 'light'] as const)('applies mode=%s verbatim', mode => {
    expect(renderMode(mode)?.getAttribute('data-astryx-media')).toBe(mode);
  });

  it('renders no media attribute for mode="off"', () => {
    const wrapper = renderMode('off');
    expect(wrapper?.hasAttribute('data-astryx-media')).toBe(false);
  });

  it('still renders its element for mode="off" so children never remount', () => {
    expect(renderMode('off')?.tagName).toBe('DIV');
  });

  it('falls back to dark for an unmeasurable auto surface', () => {
    expect(renderMode('auto')?.getAttribute('data-astryx-media')).toBe('dark');
  });

  it('honors an explicit fallback', () => {
    expect(renderMode('auto', 'light')?.getAttribute('data-astryx-media')).toBe(
      'light',
    );
  });

  it('ignores fallback when the mode is explicit', () => {
    expect(renderMode('dark', 'light')?.getAttribute('data-astryx-media')).toBe(
      'dark',
    );
  });

  it('leaves no probe element behind', () => {
    const {container} = render(
      <div style={{background: 'rgb(10, 19, 23)'}}>
        <MediaTheme mode="auto">
          <span>content</span>
        </MediaTheme>
      </div>,
    );
    expect(container.querySelectorAll('span')).toHaveLength(1);
  });

  // Regression: an earlier revision keyed the measurement to a dependency
  // array, so a surface whose color changed by prop kept a stale mode until
  // something unrelated re-ran the effect.
  it('re-measures when the surface changes without the theme changing', () => {
    function Harness({background}: {background: string}) {
      return (
        <div style={{background}}>
          <MediaTheme mode="auto" fallback="dark">
            <span data-testid="child">content</span>
          </MediaTheme>
        </div>
      );
    }
    // jsdom resolves no custom properties, so the measured pick is always the
    // fallback; what this pins is that the effect RUNS again — a stale
    // implementation skips it entirely.
    const {rerender} = render(<Harness background="rgb(10, 19, 23)" />);
    const first = screen.getByTestId('child').parentElement;
    rerender(<Harness background="rgb(255, 255, 255)" />);
    expect(screen.getByTestId('child').parentElement).toBe(first);
    expect(first?.getAttribute('data-astryx-media')).toBe('dark');
  });
});
