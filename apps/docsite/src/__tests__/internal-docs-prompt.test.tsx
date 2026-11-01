// Copyright (c) Meta Platforms, Inc. and affiliates.

// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://astryx.atmeta.com/components/Button?tab=props"}

import {StrictMode} from 'react';
import {renderToString} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {
  InternalDocsPrompt,
  internalDocsHref,
} from '../components/InternalDocsPrompt';

const route = vi.hoisted(() => ({
  pathname: '/components/Button',
  search: 'tab=props',
  suspendSearch: false,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => {
    if (route.suspendSearch) {
      throw new Promise(() => {});
    }
    return new URLSearchParams(route.search);
  },
}));
vi.mock('@stylexjs/stylex', () => ({
  create: <T,>(styles: T) => styles,
  props: () => ({}),
}));

const allowedOrigins = [
  'https://astryx.atmeta.com',
  'https://astryx-git-feat-docs-internal-network-prompt-fbopensource.vercel.app',
  'https://astryx-canary.vercel.app',
];
declare const jsdom: {reconfigure(options: {url: string}): void};

let Prompt: typeof InternalDocsPrompt;
let href: typeof internalDocsHref;
const internalOrigin = 'https://astryx.internalmeta.com';
const probeOrigin = 'https://codebunny.internalmeta.com';
const message = {type: 'codebunny:access-check:v1', reachable: true};

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubEnv('NEXT_PUBLIC_DOCS_TARGET', 'latest');
  jsdom.reconfigure({
    url: 'https://astryx.atmeta.com/components/Button?tab=props',
  });
  route.pathname = '/components/Button';
  route.search = 'tab=props';
  route.suspendSearch = false;
  await loadPrompt();
});

async function loadPrompt() {
  vi.resetModules();
  const module = await import('../components/InternalDocsPrompt');
  Prompt = () => (
    <module.InternalDocsReachabilityProvider>
      <module.InternalDocsPrompt />
    </module.InternalDocsReachabilityProvider>
  );
  href = module.internalDocsHref;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function mount() {
  const view = render(
    <StrictMode>
      <Prompt />
    </StrictMode>,
  );
  await act(async () => {});
  return view;
}

function frame() {
  const result = document.querySelector('iframe');
  expect(result).not.toBeNull();
  return result!;
}

function send(
  target: HTMLIFrameElement,
  data: unknown = message,
  origin = probeOrigin,
  source: MessageEventSource | null = target.contentWindow,
) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {data, origin, source}));
  });
}

function showPrompt() {
  const target = frame();
  fireEvent.load(target);
  send(target);
}

function prompt() {
  return screen.queryByRole('region', {
    name: 'Documentation notice',
  });
}

describe('InternalDocsPrompt', () => {
  it('keeps detection at the server root without making the layout URL-aware', () => {
    const layout = readFileSync(join(__dirname, '../app/layout.tsx'), 'utf8');
    expect(layout).not.toContain("'use client'");
    expect(layout.match(/<InternalDocsReachabilityProvider>/g)).toHaveLength(1);
    expect(layout).toMatch(
      /<InternalDocsReachabilityProvider>\s*\{children\}\s*<\/InternalDocsReachabilityProvider>/,
    );
    expect(layout).not.toContain('<InternalDocsPrompt');
  });

  it('does not start another probe inside an embedded document', async () => {
    const parentFrame = document.createElement('iframe');
    document.body.append(parentFrame);
    vi.stubGlobal('top', parentFrame.contentWindow);
    try {
      expect(window.top).not.toBe(window);
      await mount();
      expect(
        document.querySelector(
          'iframe[title="Astryx documentation reachability check"]',
        ),
      ).toBeNull();
      expect(prompt()).toBeNull();
    } finally {
      vi.unstubAllGlobals();
      parentFrame.remove();
    }
  });

  it('renders nothing before a loaded iframe sends a valid message', async () => {
    await mount();
    expect(prompt()).toBeNull();
    const target = frame();
    expect(target.hidden).toBe(true);
    expect(target.tabIndex).toBe(-1);
    expect(target.getAttribute('aria-hidden')).toBe('true');
    expect(target.getAttribute('sandbox')).toBe(
      'allow-scripts allow-same-origin',
    );
    expect(target.referrerPolicy).toBe('no-referrer');
    expect(target.src).toBe(
      `${probeOrigin}/embed/access-check?parent_origin=https%3A%2F%2Fastryx.atmeta.com`,
    );
    fireEvent.load(target);
    expect(prompt()).toBeNull();
    send(target);
    expect(prompt()).not.toBeNull();
    const link = screen.getByRole('link', {
      name: /Meta internal docs/,
    });
    expect(screen.getByText('Meta internal docs', {exact: true})).toBeTruthy();
    expect(prompt()?.textContent).not.toContain("On Meta's network?");
    expect(prompt()?.textContent).toContain(
      'Meta-specific components and guidance',
    );
    expect(prompt()?.querySelectorAll('a')).toHaveLength(1);
    expect(prompt()?.querySelectorAll('button')).toHaveLength(1);
    expect(link.getAttribute('aria-label')).toBeNull();
    expect(link.getAttribute('href')).toBe(
      `${internalOrigin}/components/Button?tab=props`,
    );
    expect(link.getAttribute('target')).toBeNull();
    expect(link.textContent).not.toContain('opens in');
    expect(document.querySelector('iframe')).toBeNull();
  });

  it.each(allowedOrigins)(
    'sends the actual allowlisted parent origin: %s',
    async origin => {
      const {ALLOWED_PARENT_ORIGINS} =
        await import('../lib/useInternalDocsPrompt');
      expect(ALLOWED_PARENT_ORIGINS).toEqual(allowedOrigins);
      jsdom.reconfigure({url: `${origin}/docs/tokens?mode=dark`});
      await mount();
      const target = frame();
      expect(new URL(target.src).searchParams.get('parent_origin')).toBe(
        origin,
      );
      fireEvent.load(target);
      send(target);
      expect(prompt()).not.toBeNull();
    },
  );

  it.each([
    'https://astryx-canary.vercel.app.evil.example',
    'https://astryx-git-feat-docs-internal-network-prompt-fbopensource.vercel.app.evil.example',
    'http://astryx-canary.vercel.app',
    'https://astryx-f3fuc1mqg-fbopensource.vercel.app',
    'https://astryx-git-unapproved-fbopensource.vercel.app',
    'https://astryx-canary-otherteam.vercel.app',
    'http://localhost:3233',
  ])('does not probe on an unallowlisted parent: %s', async origin => {
    jsdom.reconfigure({url: `${origin}/docs/tokens`});
    await mount();
    expect(document.querySelector('iframe')).toBeNull();
    expect(prompt()).toBeNull();
  });

  it('also accepts the message before the iframe load event', async () => {
    await mount();
    const target = frame();
    send(target);
    expect(prompt()).toBeNull();
    fireEvent.load(target);
    expect(prompt()).not.toBeNull();
  });

  it.each([
    'https://evil.example',
    'https://codebunny.internalmeta.com.evil.example',
    'http://codebunny.internalmeta.com',
    'https://astryx.internalmeta.com',
    'null',
  ])('ignores messages from the wrong origin: %s', async origin => {
    await mount();
    const target = frame();
    fireEvent.load(target);
    send(target, message, origin);
    expect(prompt()).toBeNull();
    send(target);
    expect(prompt()).not.toBeNull();
  });

  it.each([
    null,
    {},
    {type: 'wrong', reachable: true},
    {type: 'astryx:access-check:v1', reachable: true},
    {type: message.type, reachable: false},
    {type: message.type, reachable: 'true'},
    {type: message.type, reachable: 1},
  ])('ignores wrong types or non-boolean reachability: %j', async data => {
    await mount();
    const target = frame();
    fireEvent.load(target);
    send(target, data);
    expect(prompt()).toBeNull();
  });

  it('ignores the right payload from another window', async () => {
    await mount();
    const target = frame();
    fireEvent.load(target);
    send(target, message, probeOrigin, window);
    expect(prompt()).toBeNull();
  });

  it('times out silently and cleans up the iframe and listener', async () => {
    const removeListener = vi.spyOn(window, 'removeEventListener');
    await mount();
    const target = frame();
    fireEvent.load(target);
    act(() => vi.advanceTimersByTime(4000));
    expect(prompt()).toBeNull();
    expect(document.querySelector('iframe')).toBeNull();
    expect(removeListener).toHaveBeenCalledWith(
      'message',
      expect.any(Function),
    );
    send(target);
    expect(prompt()).toBeNull();
  });

  it('runs at most once under StrictMode and after remounting', async () => {
    const append = vi.spyOn(document.body, 'append');
    const view = await mount();
    expect(append).toHaveBeenCalledTimes(1);
    showPrompt();
    view.unmount();
    await mount();
    expect(append).toHaveBeenCalledTimes(1);
    expect(prompt()).not.toBeNull();
  });

  it('cancels on unmount and does not restart an abandoned probe', async () => {
    const removeListener = vi.spyOn(window, 'removeEventListener');
    const view = await mount();
    view.unmount();
    expect(document.querySelector('iframe')).toBeNull();
    expect(removeListener).toHaveBeenCalledWith(
      'message',
      expect.any(Function),
    );
    await mount();
    expect(document.querySelector('iframe')).toBeNull();
    expect(prompt()).toBeNull();
  });

  it('dismisses only the mounted view without writing storage or cookies', async () => {
    for (const path of [
      'components/InternalDocsPrompt.tsx',
      'lib/useInternalDocsPrompt.ts',
    ]) {
      const source = readFileSync(join(__dirname, '..', path), 'utf8');
      expect(source).not.toMatch(
        /sessionStorage|localStorage|document\.cookie/,
      );
    }
    const view = await mount();
    showPrompt();
    const before = {
      session: {...window.sessionStorage},
      local: {...window.localStorage},
      cookie: document.cookie,
    };
    const close = screen.getByRole('button', {
      name: 'Dismiss documentation notice for this page view',
    });
    expect(close.getAttribute('tabindex')).not.toBe('-1');
    fireEvent.click(close);
    expect(prompt()).toBeNull();
    view.rerender(
      <StrictMode>
        <Prompt />
      </StrictMode>,
    );
    expect(prompt()).toBeNull();
    expect({
      session: {...window.sessionStorage},
      local: {...window.localStorage},
      cookie: document.cookie,
    }).toEqual(before);
    view.unmount();
    await mount();
    expect(prompt()).not.toBeNull();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('resets dismissal on pathname and query navigation, including returning to a dismissed URL', async () => {
    const view = await mount();
    showPrompt();
    for (const [pathname, search] of [
      ['/docs/tokens', ''],
      ['/docs/tokens', 'mode=dark'],
      ['/components/Button', 'tab=props'],
    ]) {
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Dismiss documentation notice for this page view',
        }),
      );
      expect(prompt()).toBeNull();
      route.pathname = pathname;
      route.search = search;
      view.rerender(
        <StrictMode>
          <Prompt />
        </StrictMode>,
      );
      expect(prompt()).not.toBeNull();
      expect(document.querySelector('iframe')).toBeNull();
    }
  });

  it('keeps an in-flight probe alive across client navigation', async () => {
    const view = await mount();
    const target = frame();
    route.pathname = '/docs/tokens';
    view.rerender(
      <StrictMode>
        <Prompt />
      </StrictMode>,
    );
    expect(frame()).toBe(target);
    fireEvent.load(target);
    send(target);
    expect(prompt()).not.toBeNull();
  });

  it('shows one canary notice before reachability, with only the production CTA', async () => {
    vi.stubEnv('NEXT_PUBLIC_DOCS_TARGET', 'canary');
    await loadPrompt();
    await mount();
    expect(prompt()?.textContent).toContain("You're viewing Canary docs");
    expect(
      prompt()?.querySelector('.astryx-banner')?.getAttribute('data-status'),
    ).toBe('warning');
    expect(prompt()?.textContent).toContain(
      'These docs may include unreleased components and props. View production docs for the latest stable release.',
    );
    expect(prompt()?.textContent).not.toMatch(
      /Meta internal|Meta-specific components/,
    );
    expect(
      screen.getByRole('link', {name: 'View production'}).getAttribute('href'),
    ).toBe('https://astryx.atmeta.com/components/Button?tab=props');
    expect(
      screen.queryByRole('link', {
        name: 'Meta internal docs',
      }),
    ).toBeNull();
    await act(async () => vi.advanceTimersByTime(5000));
    expect(prompt()).not.toBeNull();
    expect(
      prompt()?.querySelector('.astryx-banner')?.getAttribute('data-status'),
    ).toBe('warning');
    expect(prompt()?.outerHTML).not.toMatch(
      /Meta internal|Meta-specific components/,
    );
    expect(
      screen.queryByRole('link', {
        name: 'Meta internal docs',
      }),
    ).toBeNull();
  });

  it.each([false, true])(
    'does not expose internal wording in Canary SSR (Suspense fallback: %s)',
    async suspendSearch => {
      vi.stubEnv('NEXT_PUBLIC_DOCS_TARGET', 'canary');
      await loadPrompt();
      const module = await import('../components/InternalDocsPrompt');
      route.suspendSearch = suspendSearch;
      const html = renderToString(
        <module.InternalDocsReachabilityProvider>
          <module.DocsBanner />
        </module.InternalDocsReachabilityProvider>,
      );
      expect(html).toContain(
        'These docs may include unreleased components and props. View production docs for the latest stable release.',
      );
      expect(html).toContain('View production');
      expect(html).toContain('data-status="warning"');
      expect(html).not.toMatch(/Meta internal|Meta-specific components/);
    },
  );

  it('switches the Canary notice to the internal banner’s Canary variant after a valid probe', async () => {
    vi.stubEnv('NEXT_PUBLIC_DOCS_TARGET', 'canary');
    await loadPrompt();
    await mount();
    expect(prompt()?.textContent).not.toMatch(
      /Meta internal|Meta-specific components/,
    );
    showPrompt();
    expect(prompt()?.textContent).toContain('Working on Meta internal tools?');
    expect(
      prompt()?.querySelector('.astryx-banner')?.getAttribute('data-status'),
    ).toBe('info');
    expect(prompt()?.textContent).not.toContain("You're viewing Canary docs");
    expect(prompt()?.textContent).toContain(
      'These docs may include unreleased components and props. View production docs for the latest stable release.',
    );
    expect(prompt()?.textContent).toContain(
      'Meta-specific components and guidance',
    );
    expect(
      screen.getAllByRole('region', {name: 'Documentation notice'}),
    ).toHaveLength(1);
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(
      screen
        .getByRole('link', {name: 'Meta internal docs'})
        .getAttribute('href'),
    ).toBe(`${internalOrigin}/components/Button?tab=props`);
    expect(
      screen.getByRole('link', {name: 'View production'}).getAttribute('href'),
    ).toBe('https://astryx.atmeta.com/components/Button?tab=props');
  });

  it('does not revive a dismissed canary notice when the probe finishes', async () => {
    vi.stubEnv('NEXT_PUBLIC_DOCS_TARGET', 'canary');
    await loadPrompt();
    const view = await mount();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Dismiss documentation notice for this page view',
      }),
    );
    expect(prompt()).toBeNull();
    showPrompt();
    expect(prompt()).toBeNull();
    route.search = 'tab=examples';
    view.rerender(
      <StrictMode>
        <Prompt />
      </StrictMode>,
    );
    expect(prompt()).not.toBeNull();
    expect(
      screen
        .getByRole('link', {name: 'Meta internal docs'})
        .getAttribute('href'),
    ).toBe(`${internalOrigin}/components/Button?tab=examples`);
  });

  it('offers only internal docs on a reachable production view', async () => {
    await mount();
    showPrompt();
    expect(prompt()?.textContent).toContain('Working on Meta internal tools?');
    expect(prompt()?.textContent).not.toContain('Canary');
    expect(screen.queryByRole('link', {name: 'View production'})).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('updates the link on client navigation without probing again', async () => {
    const view = await mount();
    showPrompt();
    route.pathname = '/docs/tokens';
    route.search = 'mode=dark&query=a%26b';
    view.rerender(
      <StrictMode>
        <Prompt />
      </StrictMode>,
    );
    expect(
      screen
        .getByRole('link', {name: /Meta internal docs/})
        .getAttribute('href'),
    ).toBe(`${internalOrigin}/docs/tokens?mode=dark&query=a%26b`);
    expect(document.querySelector('iframe')).toBeNull();
  });
});

describe('internalDocsHref', () => {
  it.each([
    '/',
    '/docs',
    '/docs/tokens',
    '/components/Button',
    '/templates/example',
    '/themes',
    '/playground',
  ])('preserves shared route %s and its query', pathname => {
    expect(href(pathname, 'a=1&a=2')).toBe(
      `${internalOrigin}${pathname}?a=1&a=2`,
    );
  });
  it.each([
    '/blog',
    '/blog/launch',
    '/community',
    '/changelog',
    '/playground/preview',
    '//evil.example',
    '/docs/a/b',
  ])(
    'falls back to the home page for public-only or unknown route %s',
    pathname => {
      expect(href(pathname, 'a=1')).toBe(`${internalOrigin}/`);
    },
  );
});
