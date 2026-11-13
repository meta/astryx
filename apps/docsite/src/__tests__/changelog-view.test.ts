// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Regression tests for the changelog frame (package tabs, empty state)
 *   and one page of release notes with its page navigation.
 *
 * Run: pnpm -F @astryxdesign/docsite test ChangelogView
 */

import {createElement, type ReactNode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it, vi} from 'vitest';

const navigation = vi.hoisted(() => ({pathname: '/changelog'}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    replace,
    scroll,
    prefetch,
    'aria-current': ariaCurrent,
    'aria-label': ariaLabel,
  }: {
    children: ReactNode;
    href: string;
    replace?: boolean;
    scroll?: boolean;
    prefetch?: boolean;
    'aria-current'?: string;
    'aria-label'?: string;
  }) =>
    createElement(
      'a',
      {
        href,
        'data-replace': String(replace),
        'data-scroll': String(scroll),
        'data-prefetch': String(prefetch),
        'aria-current': ariaCurrent,
        'aria-label': ariaLabel,
      },
      children,
    ),
}));

vi.mock('@stylexjs/stylex', () => ({
  create: <T>(styles: T) => styles,
  defineConsts: <T>(constants: T) => constants,
  props: () => ({}),
}));

vi.mock('@astryxdesign/core/Markdown', () => ({
  Markdown: ({children}: {children: ReactNode}) =>
    createElement('article', null, children),
}));

vi.mock('@astryxdesign/core/Text', () => ({
  Heading: ({children}: {children: ReactNode}) =>
    createElement('h1', null, children),
  Text: ({children}: {children: ReactNode}) =>
    createElement('p', null, children),
}));

vi.mock('@astryxdesign/core/Layout', () => ({
  VStack: ({children}: {children: ReactNode}) =>
    createElement('div', null, children),
}));

vi.mock('@astryxdesign/core/Section', () => ({
  Section: ({children}: {children: ReactNode}) =>
    createElement('section', null, children),
}));

vi.mock('@astryxdesign/core/TabList', () => ({
  TabList: ({children, value}: {children: ReactNode; value: string}) =>
    createElement('div', {'data-selected': value}, children),
  Tab: ({
    label,
    href,
    as: LinkComponent,
  }: {
    label: string;
    href: string;
    as: (props: {href: string; to: string; children: ReactNode}) => ReactNode;
  }) => createElement(LinkComponent, {href, to: href, children: label}),
}));

vi.mock('@astryxdesign/core/Carousel', () => ({
  Carousel: ({children}: {children: ReactNode}) =>
    createElement('div', null, children),
}));

type LinkLike = (props: {
  href: string;
  to: string;
  children: ReactNode;
  'aria-current'?: string;
  'aria-label'?: string;
}) => ReactNode;

vi.mock('@astryxdesign/core/Button', () => ({
  Button: ({
    label,
    children,
    href,
    as: LinkComponent,
    isDisabled,
    'aria-current': ariaCurrent,
  }: {
    label: string;
    children?: ReactNode;
    href?: string;
    as: LinkLike;
    isDisabled?: boolean;
    'aria-current'?: string;
  }) =>
    href != null && isDisabled !== true
      ? createElement(LinkComponent, {
          href,
          to: href,
          'aria-current': ariaCurrent,
          'aria-label': label,
          children: children ?? label,
        })
      : createElement('button', {'aria-disabled': 'true'}, label),
}));

vi.mock('@astryxdesign/core/Icon', () => ({
  Icon: () => null,
}));

// The component's own page range, cut down: the first page, the pages beside
// the current one, and the last page, with a gap where pages are left out.
vi.mock('@astryxdesign/core/Pagination', () => ({
  generatePageRange: (page: number, pageCount: number) => {
    const shown = [1, page - 1, page, page + 1, pageCount].filter(
      (each, index, all) =>
        each >= 1 && each <= pageCount && all.indexOf(each) === index,
    );
    return shown.flatMap((each, index) =>
      index > 0 && each - (shown[index - 1] ?? each) > 1
        ? ['...', each]
        : [each],
    );
  },
}));

vi.mock('@astryxdesign/core/theme/tokens.stylex', () => ({
  colorVars: {},
  fontWeightVars: {},
  sizeVars: {},
  spacingVars: {},
  typeScaleVars: {
    '--text-body-size': '--text-body-size',
    '--text-body-leading': '--text-body-leading',
  },
}));

import {ChangelogFrame, ChangelogNotes} from '../components/ChangelogView';
import {changelogPackages} from '../lib/changelogPages';

const packages = changelogPackages([
  {pkg: '@astryxdesign/cli', content: '# CLI\n\n# 0.0.1\n\nCLI notes'},
  {pkg: '@astryxdesign/core', content: '# Core\n\n# 0.0.1\n\nCore notes'},
]);

function renderFrame(pathname: string, shown = packages): string {
  navigation.pathname = pathname;
  return renderToStaticMarkup(
    createElement(ChangelogFrame, {
      packages: shown,
      defaultSlug: 'core',
      children: createElement('article', null, 'Notes of the page'),
    }),
  );
}

describe('ChangelogFrame', () => {
  it('selects the default package on /changelog', () => {
    const html = renderFrame('/changelog');

    expect(html).toContain('data-selected="@astryxdesign/core"');
    expect(html).toContain('Notes of the page');
  });

  it('selects the package that the URL names, on any of its pages', () => {
    expect(renderFrame('/changelog/cli')).toContain(
      'data-selected="@astryxdesign/cli"',
    );
    expect(renderFrame('/changelog/core/2')).toContain(
      'data-selected="@astryxdesign/core"',
    );
  });

  it('lists the packages in tab order', () => {
    const html = renderFrame('/changelog');

    expect(html.indexOf('@astryxdesign/core')).toBeLessThan(
      html.indexOf('@astryxdesign/cli'),
    );
  });

  it("makes each tab a link to the package's newest releases that replaces the history entry and keeps the scroll position", () => {
    const html = renderFrame('/changelog/cli');

    expect(html).toContain(
      '<a href="/changelog" data-replace="true" data-scroll="false" data-prefetch="undefined">@astryxdesign/core</a>',
    );
    expect(html).toContain(
      '<a href="/changelog/cli" data-replace="true" data-scroll="false" data-prefetch="undefined">@astryxdesign/cli</a>',
    );
  });

  it('shows an empty state, and no release notes, when no package has a changelog', () => {
    const html = renderFrame('/changelog', []);

    expect(html).toContain('Changelogs could not be loaded.');
    expect(html).not.toContain('Notes of the page');
  });
});

describe('ChangelogNotes', () => {
  function renderNotes(page: number, pageCount: number): string {
    return renderToStaticMarkup(
      createElement(ChangelogNotes, {
        markdown: '# 0.0.9\n\nNotes',
        page,
        pageCount,
        slug: 'cli',
        defaultSlug: 'core',
      }),
    );
  }

  /** Each link of the page navigation as `label -> href`, in order. */
  function pageLinks(html: string): string[] {
    const nav = html.slice(html.indexOf('<nav'));
    return Array.from(
      nav.matchAll(/<a href="([^"]+)"[^>]*aria-label="([^"]+)"/g),
      ([, href, label]) => `${label} -> ${href}`,
    );
  }

  it('renders the release notes with the page navigation below', () => {
    const html = renderNotes(2, 3);

    expect(html).toContain('# 0.0.9');
    expect(html.indexOf('</article>')).toBeLessThan(html.indexOf('<nav'));
    expect(html).toContain('<nav aria-label="Older and newer releases">');
  });

  it('has no page navigation when the releases fit on one page', () => {
    expect(renderNotes(1, 1)).not.toContain('<nav');
  });

  it("makes each page a link to that page of the package's releases", () => {
    expect(pageLinks(renderNotes(2, 9))).toEqual([
      'Go to previous page -> /changelog/cli',
      'Go to page 1 -> /changelog/cli',
      'Go to page 2 -> /changelog/cli/2',
      'Go to page 3 -> /changelog/cli/3',
      'Go to page 9 -> /changelog/cli/9',
      'Go to next page -> /changelog/cli/3',
    ]);
  });

  it('marks the current page and shows a gap for the pages it leaves out', () => {
    const html = renderNotes(2, 9);

    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(
      /<a href="\/changelog\/cli\/2"[^>]*aria-current="page"[^>]*>2<\/a>/,
    );
    expect(html).toContain('<span aria-hidden="true">…</span>');
  });

  it('replaces the history entry and does not prefetch a page', () => {
    const links = renderNotes(2, 3).match(/<a [^>]*>/g) ?? [];

    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toContain('data-replace="true"');
      expect(link).toContain('data-prefetch="false"');
    }
  });

  it('has no link past either end of the releases', () => {
    const first = renderNotes(1, 3);
    expect(pageLinks(first)).not.toContain(
      'Go to previous page -> /changelog/cli',
    );
    expect(first).toContain(
      '<button aria-disabled="true">Go to previous page</button>',
    );

    const last = renderNotes(3, 3);
    expect(pageLinks(last).some(link => link.startsWith('Go to next'))).toBe(
      false,
    );
    expect(last).toContain(
      '<button aria-disabled="true">Go to next page</button>',
    );
  });
});
