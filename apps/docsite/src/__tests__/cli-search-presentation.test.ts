// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  BookText,
  Braces,
  LayoutTemplate,
  PanelTopDashed,
  Shapes,
  SwatchBook,
  Webhook,
} from 'lucide-react';
import {searchResultPresentation} from '../lib/cliSearchPresentation';
import type {SiteSearchResult} from '../lib/cliSearchTypes';

function result(
  fields: Pick<SiteSearchResult, 'domain' | 'name'> & Partial<SiteSearchResult>,
): SiteSearchResult {
  return {
    score: 100,
    reason: 'test',
    description: '',
    command: '',
    package: '@astryxdesign/core',
    href: '/',
    ...fields,
  } as SiteSearchResult;
}

describe('site search presentation', () => {
  it.each([
    [
      result({domain: 'component', name: 'Theme'}),
      {title: 'Theme', context: 'Component', icon: Shapes},
    ],
    [
      result({domain: 'hook', name: 'useTheme'}),
      {title: 'useTheme', context: 'Hook', icon: Webhook},
    ],
    [
      result({
        domain: 'template',
        name: 'ButtonFloating',
        displayName: 'Button — Floating',
        kind: 'block',
      }),
      {
        title: 'Button — Floating',
        context: 'Component Example',
        icon: PanelTopDashed,
      },
    ],
    [
      result({
        domain: 'template',
        name: 'ButtonShowcase',
        displayName: 'Button — Variants',
        kind: 'block',
        href: '/components/Button',
      }),
      {title: 'Button', context: 'Component', icon: Shapes},
    ],
    [
      result({
        domain: 'template',
        name: 'analytics-dashboard',
        displayName: 'Analytics Dashboard',
        kind: 'page',
      }),
      {
        title: 'Analytics Dashboard',
        context: 'Page Template',
        icon: LayoutTemplate,
      },
    ],
    [
      result({domain: 'theme', name: 'neutral', displayName: 'Neutral'}),
      {title: 'Neutral', context: 'Theme', icon: SwatchBook},
    ],
  ])('presents catalog result %#', (input, expected) => {
    expect(searchResultPresentation(input)).toEqual(expected);
  });

  it.each([
    ['Theming', 'Guides › Theming', 'guide', 'Guide', BookText],
    [
      'Dark mode',
      'Guides › Theming › Dark mode',
      'guide',
      'Guide · Theming',
      BookText,
    ],
    [
      'Themes',
      'Authoring › Building Blocks › Themes',
      'guide',
      'Guide · Authoring › Building Blocks',
      BookText,
    ],
    [
      'Component lookups',
      'Astryx CLI › Guides › Component lookups',
      'guide',
      'Guide · Astryx CLI',
      BookText,
    ],
    [
      'astryx theme',
      'Astryx CLI › Commands › astryx theme',
      undefined,
      'Reference · Commands',
      Braces,
    ],
    [
      'Overview',
      'Typography › Font Setup › Overview',
      'foundations',
      'Foundation · Typography › Font Setup',
      BookText,
    ],
    [
      'All Tokens',
      'Foundations › All Tokens',
      'foundations',
      'Foundation',
      BookText,
    ],
  ])(
    'presents %s as a typed document location',
    (siteTitle, title, siteCategory, context, icon) => {
      expect(
        searchResultPresentation(
          result({
            domain: 'doc',
            name: title.toLowerCase().replaceAll(' ', '-'),
            package: '@astryxdesign/cli',
            siteTitle,
            siteCategory,
            title,
          }),
        ),
      ).toEqual({title: siteTitle, context, icon});
    },
  );
});
