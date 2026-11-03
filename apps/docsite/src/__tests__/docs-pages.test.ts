// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  SIDEBAR_PARENTS,
  applySidebarParents,
  mergeFlatTopics,
  namespaceCategory,
  namespacePage,
  rootNamespacePages,
  sectionAnchors,
  withCliCommands,
} from '../../scripts/docs-pages.mjs';
import {buildOutline} from '../components/docs/docOutline';
import {
  docRedirects,
  docTopics,
  type DocSection,
} from '../generated/docsRegistry';

const section = (title: string, text = `${title} text.`) => ({
  title,
  content: [{type: 'prose', text}],
});

/** The flat topic as the site had it before the split. */
const widgetsBefore = {
  topic: 'widgets',
  title: 'Widgets',
  description: 'Pick and place widgets.',
  category: 'foundations',
  sections: [
    section('Overview'),
    section('Sizes'),
    section('Best Practices'),
    section('Theming'),
  ],
};

type Guide = {route: string; title: string; category: string | null};

/**
 * A docs reader shaped like the CLI docs API after `widgets` became a root
 * namespace of two guides: `docs(route)` reads one guide, and
 * `docs(route, undefined, {depth: 'all', detail: 'full'})` reads the
 * namespace with every guide's compiled sections.
 */
function splitReader(
  guides: Array<Guide & {sections: ReturnType<typeof section>[]}>,
) {
  return async (
    route?: string,
    _section?: string,
    options: {depth?: number | 'all'} = {},
  ) => {
    const guide = guides.find(g => g.route === route);
    if (guide) {
      return {
        type: 'docs.detail',
        data: {
          title: guide.title,
          category: guide.category,
          sections: guide.sections,
        },
      };
    }
    if (route === 'widgets' && options.depth === 'all') {
      return {
        type: 'docs.node',
        data: {
          route: 'widgets',
          kind: 'namespace',
          title: 'Widgets',
          summary: 'Pick and place widgets.',
          content: [],
          slots: [
            {
              name: 'guides',
              title: 'Guides',
              children: guides.map(g => ({
                route: g.route,
                kind: 'generic',
                title: g.title,
                sections: g.sections,
              })),
            },
          ],
        },
      };
    }
    throw new Error(`unexpected read ${route}`);
  };
}

describe('a flat topic split into a docs-tree namespace', () => {
  const guides = [
    {
      route: 'widgets/basics',
      title: 'Basics',
      category: 'foundations',
      sections: widgetsBefore.sections.slice(0, 2),
    },
    {
      route: 'widgets/advanced',
      title: 'Advanced',
      category: 'foundations',
      sections: widgetsBefore.sections.slice(2),
    },
  ];

  it('keeps one page at the old slug, in the same group, with the same sections', async () => {
    const result = await namespacePage(splitReader(guides), 'widgets');
    expect(result?.page).toEqual(widgetsBefore);
  });

  it('sends each guide slug to its section on that page', async () => {
    const result = await namespacePage(splitReader(guides), 'widgets');
    expect(result?.redirects).toEqual({
      'widgets-basics': '/docs/widgets#overview',
      'widgets-advanced': '/docs/widgets#best-practices',
    });
  });

  it('has no page for a level whose children are not placed under it', async () => {
    const read = async () => ({
      type: 'docs.node',
      data: {
        route: 'foundations',
        kind: 'namespace',
        title: 'Foundations',
        content: [],
        slots: [
          {
            name: 'topics',
            children: [{route: 'color', kind: 'generic', sections: []}],
          },
        ],
      },
    });
    expect(await namespacePage(read, 'foundations')).toBeNull();
  });
});

describe('a page for part of a namespace', () => {
  const nested = async (
    route?: string,
    _section?: string,
    options: {depth?: number | 'all'} = {},
  ) => {
    const guideNode = (r: string, title: string) => ({
      route: r,
      kind: 'generic',
      title,
      sections: [section(title)],
    });
    if (route === 'kit/guides' && options.depth === 'all') {
      return {
        type: 'docs.node',
        data: {
          route: 'kit/guides',
          kind: 'namespace',
          title: 'Guides',
          summary: 'Kit guides.',
          content: [],
          slots: [
            {
              name: 'guides',
              children: [
                guideNode('kit/guides/start', 'Start'),
                {
                  route: 'kit/guides/docs',
                  kind: 'namespace',
                  title: 'Docs',
                  content: [],
                  slots: [
                    {
                      name: 'guides',
                      children: [guideNode('kit/guides/docs/write', 'Write')],
                    },
                  ],
                },
              ],
            },
          ],
        },
      };
    }
    return {type: 'docs.detail', data: {category: 'guide', sections: []}};
  };

  it('takes its own slug and title, leaves out what another page holds, and redirects older slugs', async () => {
    const result = await namespacePage(nested, 'kit/guides', {
      slug: 'kit-guide',
      title: 'Kit Guide',
      except: ['kit/guides/docs'],
      aliases: ['kit-overview'],
    });
    expect(result?.page).toMatchObject({
      topic: 'kit-guide',
      title: 'Kit Guide',
      category: 'guide',
    });
    const page = result?.page as {sections: Array<{title: string}>};
    expect(page.sections.map(s => s.title)).toEqual(['Start']);
    expect(result?.redirects).toEqual({
      'kit-guides-start': '/docs/kit-guide#start',
      'kit-guides': '/docs/kit-guide',
      'kit-overview': '/docs/kit-guide',
    });
  });
});

describe('a nested namespace with a page of its own', () => {
  const guideNode = (route: string, title: string) => ({
    route,
    kind: 'generic',
    title,
    sections: [section(title)],
  });
  const extras = {
    route: 'kit/extras',
    kind: 'namespace',
    title: 'Extras',
    summary: 'Extra parts for the kit.',
    content: [{type: 'prose', text: 'Extras fit every kit.'}],
    slots: [
      {
        name: 'guides',
        children: [guideNode('kit/extras/fit', 'Fit an extra')],
      },
    ],
  };
  const reader = async (
    route?: string,
    _section?: string,
    options: {depth?: number | 'all'} = {},
  ) => {
    if (route === 'kit' && options.depth === 'all') {
      return {
        type: 'docs.node',
        data: {
          route: 'kit',
          kind: 'namespace',
          title: 'Kit',
          summary: 'Build the kit.',
          content: [],
          slots: [
            {
              name: 'guides',
              children: [guideNode('kit/start', 'Start'), extras],
            },
          ],
        },
      };
    }
    if (route === 'kit/extras' && options.depth === 'all') {
      return {type: 'docs.node', data: extras};
    }
    return {type: 'docs.detail', data: {category: 'guide', sections: []}};
  };
  const pages = () =>
    rootNamespacePages(reader, 'kit', {nested: ['kit/extras']});

  it('leaves the nested namespace off its root page', async () => {
    const {root} = await pages();
    const page = root?.page as {
      topic: string;
      sections: Array<{title: string}>;
    };
    expect(page.topic).toBe('kit');
    expect(page.sections.map(s => s.title)).toEqual(['Start']);
    expect(root?.redirects).toEqual({'kit-start': '/docs/kit#start'});
  });

  it('gives it a full page at its slug, under its root page', async () => {
    const {nested} = await pages();
    expect(nested).toHaveLength(1);
    const [extrasPage] = nested;
    expect(extrasPage.page).toMatchObject({
      topic: 'kit-extras',
      title: 'Extras',
      description: 'Extra parts for the kit.',
      category: 'guide',
      parent: 'kit',
    });
    const page = extrasPage.page as {sections: Array<{title: string}>};
    expect(page.sections.map(s => s.title)).toEqual([
      'Overview',
      'Fit an extra',
    ]);
    expect(extrasPage.redirects).toEqual({
      'kit-extras-fit': '/docs/kit-extras#fit-an-extra',
    });
  });

  it('keeps a root namespace with no nested page to one page', async () => {
    const {root, nested} = await rootNamespacePages(
      splitReader([
        {
          route: 'widgets/basics',
          title: 'Basics',
          category: 'foundations',
          sections: widgetsBefore.sections,
        },
      ]),
      'widgets',
    );
    expect(root?.page).toEqual(widgetsBefore);
    expect(nested).toEqual([]);
  });
});

describe('sidebar parents', () => {
  const pageAt = (topic: string, parent?: string) => ({
    topic,
    ...(parent ? {parent} : {}),
  });

  it('puts each named page under its parent and leaves the rest alone', () => {
    const pages = applySidebarParents(
      [pageAt('icons'), pageAt('icon-files'), pageAt('kit-extras', 'kit')],
      new Map([['icon-files', 'icons']]),
    );
    expect(pages).toEqual([
      pageAt('icons'),
      pageAt('icon-files', 'icons'),
      pageAt('kit-extras', 'kit'),
    ]);
  });

  it('fails the build on a missing page, a page under itself, or a second level', () => {
    expect(() =>
      applySidebarParents([pageAt('icons')], new Map([['gone', 'icons']])),
    ).toThrow(/gone/);
    expect(() =>
      applySidebarParents([pageAt('icons')], new Map([['icons', 'gone']])),
    ).toThrow(/gone/);
    expect(() =>
      applySidebarParents([pageAt('icons')], new Map([['icons', 'icons']])),
    ).toThrow(/two different pages/);
    expect(() =>
      applySidebarParents(
        [pageAt('a'), pageAt('b', 'a'), pageAt('c')],
        new Map([['c', 'b']]),
      ),
    ).toThrow(/itself under another page/);
  });

  it('places the site pages it names, at unchanged URLs', () => {
    for (const [child, parent] of SIDEBAR_PARENTS) {
      expect(docTopics.find(topic => topic.topic === child)?.parent).toBe(
        parent,
      );
      expect(docTopics.some(topic => topic.topic === parent)).toBe(true);
      expect(docRedirects).not.toHaveProperty(child);
    }
    expect(SIDEBAR_PARENTS.get('cli-experimental-icon-sets')).toBe('icons');
    expect(SIDEBAR_PARENTS.get('cli-experimental-icon-set-files')).toBe(
      'icons',
    );
    expect(SIDEBAR_PARENTS.get('styling')).toBe('styling-overview');
  });
});

describe('namespaceCategory', () => {
  it('prefers the namespace, then foundations only when every guide is', () => {
    expect(namespaceCategory('guide', ['foundations'])).toBe('guide');
    expect(namespaceCategory(null, ['foundations', 'foundations'])).toBe(
      'foundations',
    );
    expect(namespaceCategory(null, ['foundations', 'guide'])).toBe('guide');
    expect(namespaceCategory(null, [null])).toBe('guide');
  });
});

describe('mergeFlatTopics', () => {
  const flat = (topic: string, titles: string[]) => ({
    topic,
    title: topic,
    description: '',
    category: 'guide',
    sections: titles.map(t => section(t)),
  });

  it('shows the theme split on one theme page', () => {
    const {topics, redirects} = mergeFlatTopics([
      flat('theme', ['Wrap your app in a theme']),
      flat('use-a-theme', ['Wrap your app in a theme', 'Dark mode']),
      flat('author-a-theme', ['Custom themes']),
      flat('color', ['Overview']),
    ]);
    expect(topics.map(t => t.topic)).toEqual(['theme', 'color']);
    expect(topics[0].sections.map((s: {title: string}) => s.title)).toEqual([
      'Wrap your app in a theme',
      'Dark mode',
      'Custom themes',
    ]);
    expect(redirects).toEqual({
      'use-a-theme': '/docs/theme#wrap-your-app-in-a-theme',
      'author-a-theme': '/docs/theme#custom-themes',
    });
  });

  it('leaves the topics alone before the split', () => {
    const before = [flat('theme', ['Dark mode']), flat('tokens', ['Color'])];
    expect(mergeFlatTopics(before)).toEqual({topics: before, redirects: {}});
  });

  it('keeps token data off the site', () => {
    const {topics, redirects} = mergeFlatTopics([flat('token-tables', ['A'])]);
    expect(topics).toEqual([]);
    expect(redirects).toEqual({'token-tables': '/docs/tokens'});
  });
});

describe('sectionAnchors', () => {
  it('matches the page outline, repeats and heading blocks included', () => {
    const sections = [
      {
        title: 'Overview',
        content: [{type: 'heading', text: 'Overview'}],
      },
      section('Overview'),
      section('Best Practices'),
      section('Best practices'),
    ];
    expect(sectionAnchors(sections)).toEqual(
      buildOutline(sections as DocSection[]).sectionIds,
    );
  });
});

describe('CLI commands on docsite pages', () => {
  it('prefixes commands in prose, lists, tables and shell code only', () => {
    const show = (text: string, lang: string | null = null) =>
      lang === 'tsx' ? text : text.replaceAll('`astryx', '`npx astryx');
    const [shown] = withCliCommands(
      [
        {
          title: 'Run it',
          content: [
            {type: 'prose', text: 'Run `astryx docs`.'},
            {type: 'list', items: ['`astryx doctor`']},
            {type: 'table', rows: [['Neutral', 'astryx theme add neutral']]},
            {type: 'code', lang: 'tsx', code: '`astryx docs`'},
          ],
        },
      ],
      show,
      'npx astryx',
    );
    expect(shown.content).toEqual([
      {type: 'prose', text: 'Run `npx astryx docs`.'},
      {type: 'list', items: ['`npx astryx doctor`']},
      {type: 'table', rows: [['Neutral', 'npx astryx theme add neutral']]},
      {type: 'code', lang: 'tsx', code: '`astryx docs`'},
    ]);
  });

  it('shows the Authoring page a command that runs before any install', () => {
    const page = docTopics.find(topic => topic.topic === 'authoring');
    const section = page?.sections.find(
      each => each.title === 'Verify the packed import',
    );
    expect(section?.content).toContainEqual(
      expect.objectContaining({
        type: 'code',
        code: 'npx @astryxdesign/cli integration verify',
      }),
    );
  });
});
