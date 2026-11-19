// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useToast.test.tsx
 * @input Uses vitest, @testing-library/react, useToast/ToastViewport/Theme
 * @output Unit tests for the fallback viewport: its theme mode resolution,
 *   and the Theme nesting its root provides (a <Theme> inside toast content
 *   scopes its own subtree and never rewrites <html>)
 * @position Testing; validates useToast.tsx's attribute mirroring onto the
 *   fallback container and the ThemeNestingContext its root renders under,
 *   plus useTheme.ts's <html data-theme> fallback (which is what actually
 *   resolves Toast's JS-computed mode; see useTheme.test.tsx for direct
 *   coverage of that half)
 *
 * SYNC: When useToast.tsx's fallback container setup changes, update these tests
 *
 * The fallback viewport root is a module-level singleton, so it's mounted
 * once (by whichever test runs first) and persists across every test in the
 * file below — mirroring a real app whose root <Theme> mode changes over
 * time. Each test dismisses its own toast in afterEach (see
 * dismissAllFallbackToasts) so none linger as a useTheme subscriber into the
 * next test.
 */

import {describe, it, expect, vi, afterEach} from 'vitest';
import {render, screen, fireEvent, act, waitFor} from '@testing-library/react';
import React from 'react';
import {Theme} from '../theme/Theme';
import {defineTheme} from '../theme/defineTheme';
import {ToastViewport} from './ToastViewport';
import {useToast} from './useToast';
import type {ToastOptions} from './types';

const testTheme = defineTheme({name: 'test', tokens: {}});
const NO_AUTO_HIDE: ToastOptions = {body: 'hello', isAutoHide: false};

function mockMatchMedia(prefersDark: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('dark') ? prefersDark : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function ShowToastButton({label = 'Trigger'}: {label?: string}) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast(NO_AUTO_HIDE)}>
      {label}
    </button>
  );
}

// The fallback's toasts accumulate in one persistent viewport across tests
// (see file header) — take the most recently added one.
function newestMediaAttr(scope: ParentNode): string | null {
  const nodes = scope.querySelectorAll('[data-astryx-media]');
  const last = nodes[nodes.length - 1];
  return last ? last.getAttribute('data-astryx-media') : null;
}

// Fire the transition-end that ToastViewport listens for to unmount an
// exiting toast (jsdom does not run CSS transitions) — mirrors
// ToastViewport.test.tsx's completeExit helper.
function completeExit(toastId: string) {
  const node = document.querySelector<HTMLElement>(
    `[data-toast-id="${toastId}"]`,
  );
  if (node) {
    fireEvent.transitionEnd(node, {propertyName: 'grid-template-rows'});
  }
}

// Dismisses every toast still mounted in the fallback viewport so none of
// them remain subscribed to useTheme's shared MutationObserver by the time
// RTL's own cleanup unmounts this test's <Theme> — that unmount would
// otherwise notify a lingering subscriber outside any act scope.
async function dismissAllFallbackToasts(): Promise<void> {
  const fallback = document.querySelector('[data-astryx-toast-fallback]');
  const ids = Array.from(
    fallback?.querySelectorAll<HTMLElement>('[data-toast-id]') ?? [],
  ).map(node => node.getAttribute('data-toast-id')!);

  await act(async () => {
    for (const id of ids) {
      fallback
        ?.querySelector<HTMLElement>(
          `[data-toast-id="${id}"] button[aria-label="Dismiss notification"]`,
        )
        ?.click();
    }
  });

  await act(async () => {
    for (const id of ids) {
      completeExit(id);
    }
  });
}

describe('useToast fallback viewport theme mode', () => {
  afterEach(async () => {
    mockMatchMedia(false);
    await dismissAllFallbackToasts();
  });

  it('keeps a Theme inside fallback toast content nested: it never rewrites <html>', async () => {
    // The fallback root is a separate React root, so a brand Theme in toast
    // content sees no Theme ancestor. It must not act as the app's root
    // Theme: <html data-theme> / data-astryx-theme stay the app's, while
    // the brand Theme still scopes its own subtree.
    const brand = defineTheme({name: 'fallback-brand', tokens: {}});
    function BrandedToastButton() {
      const toast = useToast();
      return (
        <button
          type="button"
          onClick={() =>
            toast({
              body: 'branded',
              isAutoHide: false,
              endContent: (
                <Theme theme={brand} mode="dark">
                  <span>brand</span>
                </Theme>
              ),
            })
          }>
          Trigger branded
        </button>
      );
    }

    render(
      <Theme theme={testTheme} mode="light">
        <BrandedToastButton />
      </Theme>,
    );
    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    });
    // Whichever test clicks first in this file finds the fallback viewport
    // not yet connected, so its toast waits in the queue. The queue hands it
    // over in the viewport's effect, and an async act() flushes that effect.
    await act(async () => {
      fireEvent.click(screen.getByText('Trigger branded'));
    });
    await waitFor(() => {
      expect(screen.getByText('brand')).toBeInTheDocument();
    });
    await act(async () => {});

    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(document.documentElement).toHaveAttribute(
      'data-astryx-theme',
      'test',
    );
    const brandScope = document.querySelector(
      '[data-astryx-toast-fallback] [data-astryx-theme="fallback-brand"]',
    );
    expect(brandScope).toHaveAttribute('data-theme', 'dark');
  });

  it('resolves the app mode (light) instead of OS preference (dark) with no LayerProvider', async () => {
    mockMatchMedia(true); // OS prefers dark

    render(
      <Theme theme={testTheme} mode="light">
        <ShowToastButton />
      </Theme>,
    );

    // Async act for the same reason as the first test above: under .only, -t
    // or a shuffled order this can be the click that finds the proxy pending.
    await act(async () => {
      fireEvent.click(screen.getByText('Trigger'));
    });

    await waitFor(() => {
      expect(
        document.querySelector(
          '[data-astryx-toast-fallback] [data-astryx-media]',
        ),
      ).not.toBeNull();
    });

    // App mode is light, so the toast's inverted surface must be dark — if
    // the fallback fell back to OS preference (dark) instead, this would be
    // 'light' and the toast's text/icon would compute the same color as its
    // own background (the invisible-toast bug).
    expect(
      newestMediaAttr(document.querySelector('[data-astryx-toast-fallback]')!),
    ).toBe('dark');
  });

  it('keeps the OS-preference fallback for mode="system" with no LayerProvider', async () => {
    mockMatchMedia(true); // OS prefers dark

    render(
      <Theme theme={testTheme} mode="system">
        <ShowToastButton label="Trigger System" />
      </Theme>,
    );

    // The fallback viewport is a persistent module singleton (see file
    // header), so earlier tests may have already added toasts to it — count
    // beforehand instead of assuming a fixed prior count, so this test
    // survives running alone (.only, -t, shuffle) as well as in sequence.
    const countBefore = document.querySelectorAll(
      '[data-astryx-toast-fallback] [data-astryx-media]',
    ).length;

    act(() => {
      fireEvent.click(screen.getByText('Trigger System'));
    });

    await waitFor(() => {
      const nodes = document.querySelectorAll(
        '[data-astryx-toast-fallback] [data-astryx-media]',
      );
      expect(nodes.length).toBeGreaterThan(countBefore);
    });

    // mode="system" means #1587 removes data-theme from <html> — useTheme's
    // <html data-theme> fallback then has nothing to read, leaving its own
    // OS-preference resolution (dark here) in place, same as before this fix.
    expect(
      newestMediaAttr(document.querySelector('[data-astryx-toast-fallback]')!),
    ).toBe('light');
  });

  it('draws a toast shown from a Theme under that Theme, whatever <html> says', async () => {
    // A host page (an artifact viewer) can rewrite <html data-astryx-theme>
    // to its own theme. A toast shown from inside the app's Theme still
    // draws under that Theme and mode.
    const caller = defineTheme({name: 'fallback-caller', tokens: {}});
    render(
      <Theme theme={caller} mode="light">
        <ShowToastButton label="Trigger Caller" />
      </Theme>,
    );
    document.documentElement.setAttribute('data-astryx-theme', 'host-page');
    document.documentElement.setAttribute('data-theme', 'dark');
    await act(async () => {
      fireEvent.click(screen.getByText('Trigger Caller'));
    });
    await waitFor(() => {
      expect(
        document.querySelector(
          '[data-astryx-toast-fallback] [data-astryx-theme="fallback-caller"]',
        ),
      ).not.toBeNull();
    });
    const scope = document.querySelector(
      '[data-astryx-toast-fallback] [data-astryx-theme="fallback-caller"]',
    ) as HTMLElement;
    expect(scope).toHaveAttribute('data-theme', 'light');
    // The toast card sits inside the caller's scope, so the caller's theme
    // CSS reaches it and the host page's stops at the scope.
    expect(scope.querySelector('[data-astryx-media]')).not.toBeNull();
    // Light page: the inverted card is the dark side.
    expect(newestMediaAttr(scope)).toBe('dark');
  });

  it('draws a toast shown from outside any Theme under <html>, with no scope of its own', async () => {
    function ShowOutside() {
      const toast = useToast();
      return (
        <button
          type="button"
          onClick={() => toast({body: 'outside any Theme', isAutoHide: false})}>
          Trigger Outside
        </button>
      );
    }
    document.documentElement.setAttribute('data-astryx-theme', 'host-page');
    document.documentElement.setAttribute('data-theme', 'dark');
    render(<ShowOutside />);
    await act(async () => {
      fireEvent.click(screen.getByText('Trigger Outside'));
    });
    await waitFor(() => {
      expect(screen.getByText('outside any Theme')).toBeInTheDocument();
    });
    const fallback = document.querySelector(
      '[data-astryx-toast-fallback]',
    ) as HTMLElement;
    expect(fallback).toHaveAttribute('data-astryx-theme', 'host-page');
    expect(fallback).toHaveAttribute('data-theme', 'dark');
    // The nearest theme scope is the fallback container, which mirrors <html>.
    expect(
      screen.getByText('outside any Theme').closest('[data-astryx-theme]'),
    ).toBe(fallback);
  });

  it('follows a theme or mode change of its caller while the toast shows', async () => {
    const first = defineTheme({name: 'fallback-first', tokens: {}});
    const second = defineTheme({name: 'fallback-second', tokens: {}});
    const {rerender} = render(
      <Theme theme={first} mode="light">
        <ShowToastButton label="Trigger Follow" />
      </Theme>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('Trigger Follow'));
    });
    const scopeOf = (name: string) =>
      document.querySelector(
        `[data-astryx-toast-fallback] [data-astryx-theme="${name}"]`,
      );
    await waitFor(() => {
      expect(scopeOf('fallback-first')).toHaveAttribute('data-theme', 'light');
    });
    rerender(
      <Theme theme={first} mode="dark">
        <ShowToastButton label="Trigger Follow" />
      </Theme>,
    );
    await waitFor(() => {
      expect(scopeOf('fallback-first')).toHaveAttribute('data-theme', 'dark');
    });
    rerender(
      <Theme theme={second} mode="dark">
        <ShowToastButton label="Trigger Follow" />
      </Theme>,
    );
    await waitFor(() => {
      expect(scopeOf('fallback-second')).toHaveAttribute('data-theme', 'dark');
    });
    expect(scopeOf('fallback-first')).toBeNull();
  });

  it('follows its Theme after the component that showed it unmounts', async () => {
    const kept = defineTheme({name: 'fallback-kept', tokens: {}});
    const {rerender} = render(
      <Theme theme={kept} mode="light">
        <ShowToastButton label="Trigger Kept" />
      </Theme>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('Trigger Kept'));
    });
    const scope = () =>
      document.querySelector(
        '[data-astryx-toast-fallback] [data-astryx-theme="fallback-kept"]',
      );
    await waitFor(() => {
      expect(scope()).toHaveAttribute('data-theme', 'light');
    });
    rerender(
      <Theme theme={kept} mode="light">
        {null}
      </Theme>,
    );
    rerender(
      <Theme theme={kept} mode="dark">
        {null}
      </Theme>,
    );
    await waitFor(() => {
      expect(scope()).toHaveAttribute('data-theme', 'dark');
    });
  });

  it('draws an overwrite from a second Theme under that Theme', async () => {
    const one = defineTheme({name: 'fallback-one', tokens: {}});
    const two = defineTheme({name: 'fallback-two', tokens: {}});
    function Show({label, body}: {label: string; body: string}) {
      const toast = useToast();
      return (
        <button
          type="button"
          onClick={() =>
            toast({body, uniqueID: 'two-themes', isAutoHide: false})
          }>
          {label}
        </button>
      );
    }
    // The second Theme is nested, so <html> keeps the first one's theme and
    // mode: only the overwrite rule draws the second toast under the second
    // Theme.
    render(
      <Theme theme={one} mode="light">
        <Show label="From one" body="two-themes first" />
        <Theme theme={two} mode="dark">
          <Show label="From two" body="two-themes second" />
        </Theme>
      </Theme>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('From one'));
    });
    await waitFor(() => {
      expect(screen.getByText('two-themes first')).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('From two'));
    });
    await waitFor(() => {
      expect(screen.getByText('two-themes second')).toBeInTheDocument();
    });
    const scope = screen
      .getByText('two-themes second')
      .closest('[data-astryx-theme]');
    expect(scope).toHaveAttribute('data-astryx-theme', 'fallback-two');
    expect(scope).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement).toHaveAttribute(
      'data-astryx-theme',
      'fallback-one',
    );
  });

  it('keeps focus in place when a toast from outside any Theme overwrites one from inside', async () => {
    const themed = defineTheme({name: 'fallback-mixed', tokens: {}});
    function Show({label, body}: {label: string; body: string}) {
      const toast = useToast();
      return (
        <button
          type="button"
          onClick={() => toast({body, uniqueID: 'mixed', isAutoHide: false})}>
          {label}
        </button>
      );
    }
    render(
      <>
        <Theme theme={themed} mode="light">
          <Show label="From inside" body="mixed first" />
        </Theme>
        <Show label="From outside" body="mixed second" />
      </>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('From inside'));
    });
    await waitFor(() => {
      expect(screen.getByText('mixed first')).toBeInTheDocument();
    });
    const rowOf = (text: string) =>
      screen.getByText(text).closest('[data-toast-id]') as HTMLElement;
    const dismiss = rowOf('mixed first').querySelector('button')!;
    dismiss.focus();
    expect(document.activeElement).toBe(dismiss);
    await act(async () => {
      fireEvent.click(screen.getByText('From outside'));
    });
    await waitFor(() => {
      expect(screen.getByText('mixed second')).toBeInTheDocument();
    });
    expect(rowOf('mixed second').querySelector('button')).toBe(dismiss);
    expect(document.activeElement).toBe(dismiss);
  });

  it('mirrors <html data-theme> and data-astryx-theme onto the fallback container', async () => {
    mockMatchMedia(false);

    const {rerender} = render(
      <Theme theme={testTheme} mode="dark">
        <ShowToastButton label="Trigger Mirror" />
      </Theme>,
    );

    act(() => {
      fireEvent.click(screen.getByText('Trigger Mirror'));
    });

    await waitFor(() => {
      const fallback = document.querySelector(
        '[data-astryx-toast-fallback]',
      ) as HTMLElement;
      expect(fallback.getAttribute('data-theme')).toBe('dark');
      expect(fallback.getAttribute('data-astryx-theme')).toBe('test');
      // Inline color-scheme must follow the mirrored mode, not <html>'s own
      // (possibly #3658-pinned) theme CSS — see useToast.tsx's syncRootThemeAttrs.
      expect(fallback.style.colorScheme).toBe('dark');
    });

    // Flip the app mode: the shared MutationObserver re-syncs the container,
    // so the inline color-scheme must follow it live.
    rerender(
      <Theme theme={testTheme} mode="light">
        <ShowToastButton label="Trigger Mirror" />
      </Theme>,
    );

    await waitFor(() => {
      const fallback = document.querySelector(
        '[data-astryx-toast-fallback]',
      ) as HTMLElement;
      expect(fallback.getAttribute('data-theme')).toBe('light');
      expect(fallback.style.colorScheme).toBe('light');
    });

    // mode="system" removes <html data-theme> entirely — the inline property
    // must be removed too, reverting to whatever the CSS otherwise resolves.
    rerender(
      <Theme theme={testTheme} mode="system">
        <ShowToastButton label="Trigger Mirror" />
      </Theme>,
    );

    await waitFor(() => {
      const fallback = document.querySelector(
        '[data-astryx-toast-fallback]',
      ) as HTMLElement;
      expect(fallback.getAttribute('data-theme')).toBeNull();
      expect(fallback.style.colorScheme).toBe('');
    });
  });
});

describe('useToast LayerProvider path', () => {
  afterEach(() => {
    mockMatchMedia(false);
  });

  it('resolves mode via real context, unaffected by the fallback provider', () => {
    mockMatchMedia(true); // OS prefers dark; should be irrelevant here

    const {container} = render(
      <Theme theme={testTheme} mode="light">
        <ToastViewport isTopLayer={false}>
          <ShowToastButton label="Trigger Provider" />
        </ToastViewport>
      </Theme>,
    );

    act(() => {
      fireEvent.click(screen.getByText('Trigger Provider'));
    });

    expect(newestMediaAttr(container)).toBe('dark');
  });
});
