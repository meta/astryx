// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Regression tests for the changelog package selection and empty state.
 *
 * Run: pnpm -F @astryxdesign/docsite test ChangelogView
 */

import {createElement, type ReactNode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it, vi} from 'vitest';

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
  Tab: ({label}: {label: string}) => createElement('span', null, label),
}));

vi.mock('@astryxdesign/core/Carousel', () => ({
  Carousel: ({children}: {children: ReactNode}) =>
    createElement('div', null, children),
}));

vi.mock('@astryxdesign/core/theme/tokens.stylex', () => ({
  typeScaleVars: {
    '--text-body-size': '--text-body-size',
    '--text-body-leading': '--text-body-leading',
  },
}));

import {ChangelogView} from '../components/ChangelogView';

function renderChangelog(
  changelogs: Array<{pkg: string; content: string}>,
  selectedPackage?: string,
): string {
  return renderToStaticMarkup(
    createElement(ChangelogView, {
      changelogs,
      componentNames: [],
      selectedPackage,
    }),
  );
}

describe('ChangelogView', () => {
  it('defaults to the core package when it is available', () => {
    const html = renderChangelog([
      {pkg: '@astryxdesign/cli', content: '# CLI\n\nCLI release notes'},
      {pkg: '@astryxdesign/core', content: '# Core\n\nCore release notes'},
    ]);

    expect(html).toContain('data-selected="@astryxdesign/core"');
    expect(html).toContain('Core release notes');
    expect(html).not.toContain('CLI release notes');
  });

  it('orders core first, CLI second, and preserves the remaining order', () => {
    const html = renderChangelog([
      {
        pkg: '@astryxdesign/richtext',
        content: '# Rich text\n\nRich text release notes',
      },
      {pkg: '@astryxdesign/cli', content: '# CLI\n\nCLI release notes'},
      {pkg: '@astryxdesign/core', content: '# Core\n\nCore release notes'},
      {
        pkg: '@astryxdesign/charts',
        content: '# Charts\n\nCharts release notes',
      },
    ]);

    expect(html.indexOf('@astryxdesign/core')).toBeLessThan(
      html.indexOf('@astryxdesign/cli'),
    );
    expect(html.indexOf('@astryxdesign/cli')).toBeLessThan(
      html.indexOf('@astryxdesign/richtext'),
    );
    expect(html.indexOf('@astryxdesign/richtext')).toBeLessThan(
      html.indexOf('@astryxdesign/charts'),
    );
  });

  it('uses a valid package from the URL as the initial selection', () => {
    const html = renderChangelog(
      [
        {pkg: '@astryxdesign/cli', content: '# CLI\n\nCLI release notes'},
        {pkg: '@astryxdesign/core', content: '# Core\n\nCore release notes'},
      ],
      '@astryxdesign/cli',
    );

    expect(html).toContain('data-selected="@astryxdesign/cli"');
    expect(html).toContain('CLI release notes');
    expect(html).not.toContain('Core release notes');
  });

  it('ignores a hidden theme package from the URL', () => {
    const html = renderChangelog(
      [
        {pkg: '@astryxdesign/core', content: '# Core\n\nCore release notes'},
        {
          pkg: '@astryxdesign/theme-neutral',
          content: '# Neutral\n\nNeutral release notes',
        },
      ],
      '@astryxdesign/theme-neutral',
    );

    expect(html).toContain('data-selected="@astryxdesign/core"');
    expect(html).not.toContain('Neutral release notes');
  });

  it('hides theme packages from the primary changelog tabs', () => {
    const html = renderChangelog([
      {pkg: '@astryxdesign/core', content: '# Core\n\nCore release notes'},
      {
        pkg: '@astryxdesign/theme-neutral',
        content: '# Neutral\n\nNeutral release notes',
      },
    ]);

    expect(html).toContain('@astryxdesign/core');
    expect(html).not.toContain('@astryxdesign/theme-neutral');
  });

  it('shows an empty state when a package has no release entries', () => {
    const html = renderChangelog([
      {
        pkg: '@astryxdesign/richtext',
        content: '# @astryxdesign/richtext\n\n# 0.1.9\n\n---\n\n# 0.1.8\n',
      },
    ]);

    expect(html).toContain('No changes in this release.');
  });
});
