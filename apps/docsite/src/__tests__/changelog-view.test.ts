// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Regression tests for the changelog frame (package tabs, empty state)
 *   and one page of release notes with its page navigation.
 *
 * Run: pnpm -F @astryxdesign/docsite test ChangelogView
 */

import {createElement, type ReactNode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const navigation = vi.hoisted(() => ({
  pathname: '/changelog',
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({replace: navigation.replace}),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    replace,
    scroll,
  }: {
    children: ReactNode;
    href: string;
    replace?: boolean;
    scroll?: boolean;
  }) =>
    createElement(
      'a',
      {href, 'data-replace': String(replace), 'data-scroll': String(scroll)},
      children,
    ),
}));

vi.mock('@stylexjs/stylex', () => ({
  create: <T>(styles: T) => styles,
  defineConsts: <T>(constants: T) => constants,
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

const pagination = vi.hoisted(() => ({
  onChange: (_page: number) => {},
}));

vi.mock('@astryxdesign/core/Pagination', () => ({
  Pagination: ({
    page,
    totalPages,
    onChange,
  }: {
    page: number;
    totalPages: number;
    onChange: (page: number) => void;
  }) => {
    pagination.onChange = onChange;
    return createElement('nav', {
      'data-page': page,
      'data-total-pages': totalPages,
    });
  },
}));

vi.mock('@astryxdesign/core/theme/tokens.stylex', () => ({
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

beforeEach(() => {
  navigation.replace.mockClear();
});

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
      '<a href="/changelog" data-replace="true" data-scroll="false">@astryxdesign/core</a>',
    );
    expect(html).toContain(
      '<a href="/changelog/cli" data-replace="true" data-scroll="false">@astryxdesign/cli</a>',
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

  it('renders the release notes with the page navigation below', () => {
    const html = renderNotes(2, 3);

    expect(html).toContain('# 0.0.9');
    expect(html.indexOf('</article>')).toBeLessThan(html.indexOf('<nav'));
    expect(html).toContain('data-page="2"');
    expect(html).toContain('data-total-pages="3"');
  });

  it('has no page navigation when the releases fit on one page', () => {
    expect(renderNotes(1, 1)).not.toContain('<nav');
  });

  it("opens the chosen page of the package's releases in place of the current history entry", () => {
    renderNotes(2, 3);
    pagination.onChange(3);
    expect(navigation.replace).toHaveBeenLastCalledWith('/changelog/cli/3');

    pagination.onChange(1);
    expect(navigation.replace).toHaveBeenLastCalledWith('/changelog/cli');
  });
});
