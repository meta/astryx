// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Toast.test.tsx
 * @input Uses vitest, @testing-library/react, react-dom/server + client
 *   (SSR and hydration), Toast, ToastViewport, useToast, Theme, defineTheme
 * @output Unit tests for the Toast card itself. Today: the `themeMode`
 *   theming state it reflects (#5503) — what it reflects and from which
 *   Theme, that it is independent of the card's media surface, that it
 *   survives a custom `renderContent` layout, that it follows live changes
 *   (Theme mode, OS preference, `<html data-theme>`) and releases those
 *   subscriptions, that server markup and hydration carry it, that the
 *   detached fallback viewport reads it, that `defineTheme` can target it,
 *   and that the card reflects nothing but closed-vocabulary values
 * @position Testing; the component's own suite. ToastViewport.test.tsx holds
 *   layout, timers, focus and announcements; useToast.test.tsx holds the
 *   fallback viewport.
 *
 * SYNC: When Toast.tsx's `themeProps('toast', …)` reflection changes, update
 *   these tests and Toast.doc.mjs `theming.targets`.
 */

import {describe, it, expect, vi, afterEach} from 'vitest';
import {
  cleanup,
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from '@testing-library/react';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {hydrateRoot} from 'react-dom/client';
import {Toast} from './Toast';
import type {ToastContentRenderProps} from './types';
import {ToastViewport} from './ToastViewport';
import {useToast} from './useToast';
import {Theme} from '../theme/Theme';
import type {ThemeMode} from '../theme/types';
import {defineTheme, generateThemeCSS} from '../theme/defineTheme';
import {Button} from '../Button';

const testTheme = defineTheme({name: 'toast-theme-mode', tokens: {}});

/**
 * jsdom has no `matchMedia`; `useTheme` resolves `mode="system"` through it.
 * Same shape as useToast.test.tsx so the two Toast suites agree on how the OS
 * preference is faked.
 */
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

/**
 * A `matchMedia` whose `change` listeners can be fired, for a live OS flip.
 * `matches` is read through a getter so `useMediaQuery`'s snapshot sees the
 * current preference on every call.
 */
function mockLiveMatchMedia(initialDark: boolean) {
  let dark = initialDark;
  const listeners = new Set<() => void>();
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    get matches() {
      return query.includes('dark') ? dark : false;
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, cb: () => void) => {
      listeners.add(cb);
    },
    removeEventListener: (_type: string, cb: () => void) => {
      listeners.delete(cb);
    },
    dispatchEvent: vi.fn(),
  }));
  return {
    setPrefersDark(next: boolean) {
      dark = next;
      for (const cb of listeners) {
        cb();
      }
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

function InlineToast({
  type = 'info',
  body = 'Saved',
  endContent,
  renderContent,
}: {
  type?: 'info' | 'error';
  body?: string;
  endContent?: React.ReactNode;
  renderContent?: (toast: ToastContentRenderProps) => React.ReactNode;
}) {
  return (
    <Toast
      type={type}
      body={body}
      endContent={endContent}
      renderContent={renderContent}
      isAutoHide={false}
      autoHideDuration={5000}
      onDismiss={() => {}}
    />
  );
}

/** The card — the element carrying `astryx-toast`, found the way the other Toast suites find it. */
function card(body = 'Saved'): HTMLElement {
  const el = screen.getByText(body).closest('[data-type]');
  if (!(el instanceof HTMLElement)) {
    throw new Error(`no toast card around "${body}"`);
  }
  return el;
}

afterEach(() => {
  cleanup();
  mockMatchMedia(false);
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-astryx-theme');
});

describe('Toast reflects the Theme mode as a theming state (#5503)', () => {
  it.each(['light', 'dark'] as const)(
    'reflects mode="%s" as data-theme-mode and a state class on the card',
    mode => {
      render(
        <Theme theme={testTheme} mode={mode}>
          <InlineToast />
        </Theme>,
      );

      const el = card();
      expect(el).toHaveClass('astryx-toast');
      expect(el).toHaveAttribute('data-theme-mode', mode);
      expect(el).toHaveClass(mode);
      expect(el).not.toHaveClass(mode === 'light' ? 'dark' : 'light');
    },
  );

  it('resolves mode="system" to the OS preference — never "system"', () => {
    mockMatchMedia(true);
    render(
      <Theme theme={testTheme} mode="system">
        <InlineToast />
      </Theme>,
    );
    expect(card()).toHaveAttribute('data-theme-mode', 'dark');
  });

  it('under mode="system", follows the OS preference as it changes while mounted', () => {
    const os = mockLiveMatchMedia(false);
    render(
      <Theme theme={testTheme} mode="system">
        <InlineToast />
      </Theme>,
    );
    expect(card()).toHaveAttribute('data-theme-mode', 'light');

    act(() => {
      os.setPrefersDark(true);
    });
    expect(card()).toHaveAttribute('data-theme-mode', 'dark');
    expect(card()).toHaveClass('dark');
    expect(card()).not.toHaveClass('light');

    act(() => {
      os.setPrefersDark(false);
    });
    expect(card()).toHaveAttribute('data-theme-mode', 'light');
  });

  it('under an explicit mode, ignores an OS preference change', () => {
    // Explicit light while the OS turns dark: the two disagree, so an
    // implementation that let the OS win would show here.
    const os = mockLiveMatchMedia(false);
    render(
      <Theme theme={testTheme} mode="light">
        <InlineToast />
      </Theme>,
    );
    expect(card()).toHaveAttribute('data-theme-mode', 'light');
    act(() => {
      os.setPrefersDark(true);
    });
    expect(card()).toHaveAttribute('data-theme-mode', 'light');
    expect(card()).toHaveClass('light');
    expect(card()).not.toHaveClass('dark');
  });

  it('under mode="system", releases every OS-preference listener on unmount', () => {
    const os = mockLiveMatchMedia(false);
    const {unmount} = render(
      <Theme theme={testTheme} mode="system">
        <InlineToast />
      </Theme>,
    );
    expect(os.listenerCount).toBeGreaterThan(0);
    unmount();
    expect(os.listenerCount).toBe(0);
  });

  it.each(['banana', 'DARK', ''])(
    'treats a Theme mode outside light|dark|system ("%s") like system, never reflecting it',
    value => {
      // A persisted preference read back untyped can hand Theme a stale
      // string. Theme's own root sync already treats it as unset, so the OS
      // decides (mocked dark); the card must say so, not echo the string.
      mockMatchMedia(true);
      render(
        <Theme theme={testTheme} mode={value as ThemeMode}>
          <InlineToast />
        </Theme>,
      );
      const el = card();
      expect(el).toHaveAttribute('data-theme-mode', 'dark');
      expect(el.className.split(' ')).not.toContain(value);
    },
  );

  it('reflects the nearest Theme, which is the one whose scoped CSS reaches the card', () => {
    const inner = defineTheme({name: 'toast-theme-mode-inner', tokens: {}});
    render(
      <Theme theme={testTheme} mode="light">
        <Theme theme={inner} mode="dark">
          <InlineToast />
        </Theme>
      </Theme>,
    );
    expect(card()).toHaveAttribute('data-theme-mode', 'dark');
  });

  it('follows the Theme mode live when it changes', () => {
    const {rerender} = render(
      <Theme theme={testTheme} mode="light">
        <InlineToast />
      </Theme>,
    );
    expect(card()).toHaveAttribute('data-theme-mode', 'light');

    rerender(
      <Theme theme={testTheme} mode="dark">
        <InlineToast />
      </Theme>,
    );
    expect(card()).toHaveAttribute('data-theme-mode', 'dark');
    expect(card()).toHaveClass('dark');
    expect(card()).not.toHaveClass('light');
  });

  it('keeps the theme mode separate from the media fallback the card renders before measurement', () => {
    // The issue's scenario: an error toast paints an inverted error surface
    // that is dark in BOTH app modes, so nothing inside the card said which
    // app mode it was in. jsdom cannot measure a painted surface, so
    // `mode="auto"` renders its pre-measurement fallback — dark for an error
    // toast in every mode. In a browser the dark-app card measures to `off`
    // (no media attribute at all), which carries no app-mode information
    // either; the reflection is the one thing that differs between the two.
    for (const mode of ['light', 'dark'] as const) {
      const {unmount} = render(
        <Theme theme={testTheme} mode={mode}>
          <InlineToast type="error" body={`Failed in ${mode}`} />
        </Theme>,
      );
      const el = card(`Failed in ${mode}`);
      const media = el.querySelector('[data-astryx-media]');
      expect(media).toHaveAttribute('data-astryx-media', 'dark');
      expect(el).toHaveAttribute('data-theme-mode', mode);
      unmount();
    }
  });

  it('without a Theme ancestor, reads the mode the root Theme synced to <html data-theme>', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    render(<InlineToast />);
    expect(card()).toHaveAttribute('data-theme-mode', 'dark');
  });

  it('without a Theme ancestor or <html data-theme>, falls back to the OS preference', () => {
    mockMatchMedia(true);
    render(<InlineToast />);
    expect(card()).toHaveAttribute('data-theme-mode', 'dark');
  });

  it.each(['banana', 'system', ''])(
    'without a Theme ancestor, treats <html data-theme="%s"> as unset and never reflects it',
    value => {
      document.documentElement.setAttribute('data-theme', value);
      render(<InlineToast />);
      const el = card();
      // The OS preference (mocked light) decides; the attribute's raw text
      // never reaches the card as a value or a class.
      expect(el).toHaveAttribute('data-theme-mode', 'light');
      expect(el.className.split(' ')).not.toContain(value);
    },
  );

  it.each(['DARK', ' dark '])(
    'without a Theme ancestor, reflects only light|dark for <html data-theme="%s">',
    value => {
      document.documentElement.setAttribute('data-theme', value);
      render(<InlineToast />);
      const el = card();
      // Whether a future root reader normalizes case and whitespace or not,
      // the card only ever carries the closed vocabulary.
      expect(['light', 'dark']).toContain(el.getAttribute('data-theme-mode'));
      expect(el.className.split(' ')).not.toContain(value);
    },
  );

  it('without a Theme ancestor, follows <html data-theme> as it changes while mounted', async () => {
    document.documentElement.setAttribute('data-theme', 'light');
    render(<InlineToast />);
    expect(card()).toHaveAttribute('data-theme-mode', 'light');

    document.documentElement.setAttribute('data-theme', 'dark');
    await waitFor(() => {
      expect(card()).toHaveAttribute('data-theme-mode', 'dark');
    });
    expect(card()).toHaveClass('dark');
    expect(card()).not.toHaveClass('light');

    // Removing the attribute hands the decision back to the OS (mocked light).
    document.documentElement.removeAttribute('data-theme');
    await waitFor(() => {
      expect(card()).toHaveAttribute('data-theme-mode', 'light');
    });
  });

  it('reflects the Theme a viewport-rendered toast is nested under, not only an inline one', async () => {
    function Trigger() {
      const toast = useToast();
      return (
        <button
          type="button"
          onClick={() => toast({body: 'From viewport', isAutoHide: false})}>
          Fire
        </button>
      );
    }
    // Dark only under the inner Theme: a card reading the root Theme, or
    // <html data-theme>, would say light.
    const inner = defineTheme({name: 'toast-theme-mode-viewport', tokens: {}});
    render(
      <Theme theme={testTheme} mode="light">
        <Theme theme={inner} mode="dark">
          <ToastViewport>
            <Trigger />
          </ToastViewport>
        </Theme>
      </Theme>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Fire'));
    });
    await waitFor(() => {
      expect(card('From viewport')).toHaveAttribute('data-theme-mode', 'dark');
    });
  });
});

describe('with a custom layout (renderContent) the card is still the target (#5503)', () => {
  it.each(['light', 'dark'] as const)(
    'in mode="%s": the card reflects the mode and the custom layout renders inside it',
    mode => {
      render(
        <Theme theme={testTheme} mode={mode}>
          <InlineToast
            body="Custom body"
            renderContent={toast => (
              <div
                data-custom-root="yes"
                data-theme-mode={mode === 'light' ? 'dark' : 'light'}>
                <span>{toast.body}</span>
                <Button label="Undo" variant="secondary" size="sm" />
              </div>
            )}
          />
        </Theme>,
      );

      const el = card('Custom body');
      expect(el).toHaveAttribute('data-theme-mode', mode);
      expect(el).toHaveClass('astryx-toast', mode);
      // A property set on toast['themeMode:*'] reaches the custom layout only
      // if that layout is a descendant of the card.
      expect(el.contains(screen.getByText('Undo'))).toBe(true);
      // The renderer's own attributes stay on its root; nothing hoists, and a
      // spoofed mode on the custom layout cannot overwrite the card's.
      expect(el).not.toHaveAttribute('data-custom-root');
      expect(el).toHaveAttribute('data-theme-mode', mode);
      expect(el.querySelector('[data-custom-root]')).toHaveAttribute(
        'data-theme-mode',
        mode === 'light' ? 'dark' : 'light',
      );
    },
  );
});

describe('a viewport-rendered card reflects the Theme at the viewport (#5503)', () => {
  it.each([
    ['light', 'dark'],
    ['dark', 'light'],
  ] as const)(
    "viewport under %s, trigger under a nested %s Theme: the card says the viewport's",
    async (viewportMode, triggerMode) => {
      function Trigger() {
        const toast = useToast();
        return (
          <button
            type="button"
            onClick={() =>
              toast({body: `From ${triggerMode} trigger`, isAutoHide: false})
            }>
            Fire
          </button>
        );
      }
      // The card renders where the viewport is, so the trigger's own Theme
      // has no say: a toast is app chrome, not part of the panel that raised it.
      const panel = defineTheme({name: 'toast-theme-mode-panel', tokens: {}});
      render(
        <Theme theme={testTheme} mode={viewportMode}>
          <ToastViewport>
            <Theme theme={panel} mode={triggerMode}>
              <Trigger />
            </Theme>
          </ToastViewport>
        </Theme>,
      );
      act(() => {
        fireEvent.click(screen.getByText('Fire'));
      });
      await waitFor(() => {
        expect(card(`From ${triggerMode} trigger`)).toHaveAttribute(
          'data-theme-mode',
          viewportMode,
        );
      });
    },
  );
});

describe('the reflected state is a defineTheme target (#5503)', () => {
  it('compiles toast["themeMode:*"] — alone and compounded with type — to the attributes the card renders', () => {
    const theme = defineTheme({
      name: 'toast-theme-mode-target',
      tokens: {},
      components: {
        toast: {
          'themeMode:dark': {backgroundColor: '#111'},
          'type:error+themeMode:light': {borderColor: 'red'},
        },
      },
    });

    const {component} = generateThemeCSS(theme);
    expect(component).toContain('.astryx-toast[data-theme-mode="dark"] {');
    expect(component).toContain(
      '.astryx-toast[data-type="error"][data-theme-mode="light"] {',
    );

    render(
      <Theme theme={theme} mode="light">
        <InlineToast type="error" body="Failed" />
      </Theme>,
    );
    const el = card('Failed');
    expect(el).toHaveClass('astryx-toast');
    expect(el).toHaveAttribute('data-type', 'error');
    expect(el).toHaveAttribute('data-theme-mode', 'light');
  });

  it('carries theme-owned custom properties through the mode rules for a Button rule to read', () => {
    // The documented way to reach an action in endContent (the
    // ThemedToastAction story): the toast rules set properties the theme
    // owns, and the theme's Button rule reads them ahead of its own
    // light-dark() fallback. Every half must survive the generator unchanged,
    // the commas inside a var() fallback and a var() in the middle of a
    // shorthand included. (light-dark() takes colours only, so the ring's
    // shape stays constant and the property carries its colour.)
    const theme = defineTheme({
      name: 'toast-theme-mode-recipe',
      tokens: {},
      components: {
        toast: {
          'themeMode:light': {
            '--ink-secondary-bg': 'rgb(255 255 255 / 0.16)',
            '--ink-secondary-ring': 'transparent',
          },
          'themeMode:dark': {
            '--ink-secondary-bg': 'transparent',
            '--ink-secondary-ring': 'rgb(255 255 255 / 0.24)',
          },
        },
        button: {
          'variant:secondary': {
            backgroundColor:
              'var(--ink-secondary-bg, light-dark(rgb(27 29 34 / 0.08), transparent))',
            boxShadow:
              'inset 0 0 0 1px var(--ink-secondary-ring, light-dark(transparent, rgb(255 255 255 / 0.24)))',
          },
        },
      },
    });

    const {component} = generateThemeCSS(theme);
    expect(component).toContain(
      '.astryx-toast[data-theme-mode="light"] {\n    --ink-secondary-bg: rgb(255 255 255 / 0.16);\n    --ink-secondary-ring: transparent;',
    );
    expect(component).toContain(
      '.astryx-toast[data-theme-mode="dark"] {\n    --ink-secondary-bg: transparent;\n    --ink-secondary-ring: rgb(255 255 255 / 0.24);',
    );
    expect(component).toContain(
      '.astryx-button[data-variant="secondary"] {\n    background-color: var(--ink-secondary-bg, light-dark(rgb(27 29 34 / 0.08), transparent));\n    box-shadow: inset 0 0 0 1px var(--ink-secondary-ring, light-dark(transparent, rgb(255 255 255 / 0.24)));',
    );
  });
});

describe('server rendering reflects a mode too (#5503)', () => {
  it.each([
    ['dark', 'dark'],
    ['light', 'light'],
    ['system', 'light'],
  ] as const)(
    'server markup under mode="%s" carries data-theme-mode="%s"',
    (mode, expected) => {
      const html = renderToString(
        <Theme theme={testTheme} mode={mode}>
          <InlineToast />
        </Theme>,
      );
      expect(html).toContain(`data-theme-mode="${expected}"`);
      expect(html).not.toContain('data-theme-mode="system"');
    },
  );

  it('server markup without a Theme uses the server snapshot, not the document', () => {
    // jsdom has a document; a real server does not. The server render must
    // come from the server snapshots (no root attribute, no OS) either way, or
    // hydration could disagree with it.
    document.documentElement.setAttribute('data-theme', 'dark');
    const html = renderToString(<InlineToast />);
    expect(html).toContain('data-theme-mode="light"');
  });

  it('hydrates without a mismatch, then follows an OS that prefers dark', async () => {
    const os = mockLiveMatchMedia(true);
    const tree = (
      <Theme theme={testTheme} mode="system">
        <InlineToast body="Hydrated" />
      </Theme>
    );
    const html = renderToString(tree);
    expect(html).toContain('data-theme-mode="light"');

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, tree);
      });
      // The hydration pass reuses the server value; the next pass reads the OS.
      await waitFor(() => {
        expect(card('Hydrated')).toHaveAttribute('data-theme-mode', 'dark');
      });
      expect(card('Hydrated')).toHaveClass('dark');
      expect(consoleError).not.toHaveBeenCalled();
      expect(os.listenerCount).toBeGreaterThan(0);
    } finally {
      consoleError.mockRestore();
      await act(async () => {
        root?.unmount();
      });
      container.remove();
    }
  });
});

describe('through the fallback viewport, with no ToastViewport (#5503)', () => {
  it('reflects the mode the root Theme synced to <html data-theme>', async () => {
    // useToast announces the fallback viewport once; keep the run quiet.
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let dismiss: (() => void) | undefined;
    function Trigger() {
      const toast = useToast();
      return (
        <button
          type="button"
          onClick={() => {
            dismiss = toast({body: 'Detached', isAutoHide: false});
          }}>
          Fire
        </button>
      );
    }
    try {
      render(
        <Theme theme={testTheme} mode="dark">
          <Trigger />
        </Theme>,
      );
      await waitFor(() => {
        expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
      });
      act(() => {
        fireEvent.click(screen.getByText('Fire'));
      });

      await waitFor(() => {
        expect(card('Detached')).toHaveAttribute('data-theme-mode', 'dark');
      });
      const el = card('Detached');
      expect(el.closest('[data-astryx-toast-fallback]')).not.toBeNull();
      expect(el).toHaveClass('dark');
    } finally {
      // Dismiss and complete the exit so the detached toast is not left
      // subscribed to the root attribute when RTL unmounts the Theme.
      await act(async () => {
        dismiss?.();
      });
      await act(async () => {
        const wrapper = document.querySelector<HTMLElement>(
          '[data-astryx-toast-fallback] [data-toast-id]',
        );
        if (wrapper) {
          fireEvent.transitionEnd(wrapper, {
            propertyName: 'grid-template-rows',
          });
        }
      });
      await waitFor(() => {
        expect(screen.queryByText('Detached')).toBeNull();
      });
      consoleWarn.mockRestore();
    }
  });
});

describe('a Theme inside toast content stays a descendant (#5503)', () => {
  it('does not become the root Theme of the fallback viewport, so the card keeps reading the app', async () => {
    // The fallback viewport is a separate React root, so a brand <Theme>
    // wrapping custom content sees no Theme ancestor. It must still behave as
    // nested: theme its own subtree, never rewrite <html> and never make the
    // card reflect its own descendant's mode.
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const brand = defineTheme({name: 'toast-theme-mode-brand', tokens: {}});
    let dismiss: (() => void) | undefined;
    function Trigger() {
      const toast = useToast();
      return (
        <button
          type="button"
          onClick={() => {
            dismiss = toast({
              body: 'Branded',
              isAutoHide: false,
              renderContent: ({body}) => (
                <Theme theme={brand} mode="dark">
                  <div>{body}</div>
                </Theme>
              ),
            });
          }}>
          Fire
        </button>
      );
    }
    try {
      render(
        <Theme theme={testTheme} mode="light">
          <Trigger />
        </Theme>,
      );
      await waitFor(() => {
        expect(document.documentElement).toHaveAttribute('data-theme', 'light');
      });
      act(() => {
        fireEvent.click(screen.getByText('Fire'));
      });
      await waitFor(() => {
        expect(screen.getByText('Branded')).toBeInTheDocument();
      });
      await act(async () => {});

      const el = card('Branded');
      expect(document.documentElement).toHaveAttribute('data-theme', 'light');
      expect(document.documentElement).toHaveAttribute(
        'data-astryx-theme',
        'toast-theme-mode',
      );
      expect(el).toHaveAttribute('data-theme-mode', 'light');
      expect(el).toHaveClass('light');
      // The brand Theme still scopes its own subtree.
      expect(
        el.querySelector('[data-astryx-theme="toast-theme-mode-brand"]'),
      ).toHaveAttribute('data-theme', 'dark');
    } finally {
      await act(async () => {
        dismiss?.();
      });
      await act(async () => {
        const wrapper = document.querySelector<HTMLElement>(
          '[data-astryx-toast-fallback] [data-toast-id]',
        );
        if (wrapper) {
          fireEvent.transitionEnd(wrapper, {
            propertyName: 'grid-template-rows',
          });
        }
      });
      await waitFor(() => {
        expect(screen.queryByText('Branded')).toBeNull();
      });
      consoleWarn.mockRestore();
    }
    // The app Theme is still mounted; its <html> sync must survive dismissal.
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(document.documentElement).toHaveAttribute(
      'data-astryx-theme',
      'toast-theme-mode',
    );
  });
});

describe('the type reflection is a closed vocabulary too (#5503)', () => {
  it('reflects a padded runtime type as the info card it renders, never as extra class tokens', () => {
    // An untyped caller can hand the card any string. The card already
    // treats anything but "error" as info (role, live region, surface); the
    // reflection must agree instead of splitting the string into tokens
    // that can forge the dark state class.
    render(
      <Theme theme={testTheme} mode="light">
        <InlineToast type={'info dark' as 'info'} body="Forged" />
      </Theme>,
    );
    const el = card('Forged');
    expect(el).toHaveAttribute('role', 'status');
    expect(el).toHaveAttribute('data-type', 'info');
    expect(el).toHaveClass('info', 'light');
    expect(el).not.toHaveClass('dark');
  });
});

describe('data minimization: the card reflects closed vocabularies only (#5503)', () => {
  const body = 'SECRET-BODY-4f8a';
  const label = 'Undo LABEL-9c1';
  const href = 'https://example.com/private?token=abc123';

  it.each(['light', 'dark'] as const)(
    'in mode="%s": only data-type and data-theme-mode, with bounded values, and no content, labels, hrefs or children',
    mode => {
      render(
        <Theme theme={testTheme} mode={mode}>
          <InlineToast
            body={body}
            endContent={
              <>
                <Button label={label} variant="secondary" size="sm" />
                <a href={href} data-user-id="u-42">
                  Details
                </a>
              </>
            }
          />
        </Theme>,
      );

      const el = card(body);
      const dataAttrs = Array.from(el.attributes)
        .filter(a => a.name.startsWith('data-'))
        .map(a => [a.name, a.value] as const)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

      expect(dataAttrs).toEqual([
        ['data-theme-mode', mode],
        ['data-type', 'info'],
      ]);

      // Nothing the toast holds may surface on the card: not the body, not an
      // action's label, and — should a future reflection ever hoist child
      // attributes — not a child's href or identifiers either.
      const serialized = Array.from(el.attributes)
        .map(a => `${a.name}="${a.value}"`)
        .join(' ');
      expect(serialized).not.toContain(body);
      expect(serialized).not.toContain('LABEL-9c1');
      expect(serialized).not.toContain('token=abc123');
      expect(serialized).not.toContain('u-42');
    },
  );
});
