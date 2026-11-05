// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The site's search answers what `astryx search` answers.
 *
 * The search panel asks the site's search API (app/api/search/route.ts),
 * which calls the CLI's `search()`. These tests hold it to the CLI: for a
 * fixed list of public, made-up queries, the API's results are the results
 * `astryx search --json` prints from this site's project, in the same order;
 * every result opens a page the site has; and the panel keeps the CLI's order.
 */

import {execFile} from 'node:child_process';
import path from 'node:path';
import {promisify} from 'node:util';
import {describe, expect, it} from 'vitest';
import type {SearchResponse} from '@astryxdesign/cli/api';
import {GET} from '../app/api/search/route';
import {searchResultHref} from '../lib/searchLinks.mjs';
import type {SearchLinkTables} from '../lib/searchLinks.mjs';
import {searchResultPresentation} from '../lib/cliSearchPresentation';
import {
  createCliSearchSource,
  searchTarget,
  toSearchItem,
} from '../lib/cliSearchSource';
import type {SiteSearchResult} from '../lib/cliSearchTypes';
import docsiteConfig from '../../astryx.config.mjs';
import {docTopics, docRedirects} from '../generated/docsRegistry';
import {packages} from '../generated/packageRegistry';
import admittedRecord from '../generated/integrationPackages.json';
import linkTables from '../generated/searchLinks.json';

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, '../..');
const ASTRYX = path.join(ROOT, 'node_modules', '.bin', 'astryx');
const links = linkTables as SearchLinkTables;
const SLOW = 120_000;
/** How many `astryx search` processes the parity test runs at once. */
const CLI_AT_ONCE = 3;

/** Public, made-up queries across every domain. */
const QUERIES = [
  'button',
  'date picker',
  'dark mode',
  'how do I theme my app',
  'sidebar layout',
  'table with sorting',
  'modal dialog',
  'tokens spacing',
  'toast notification',
  'login form',
  'useMediaQuery',
  'chart',
];

/** What the site's API answers for a query. */
async function api(query: string) {
  const response = await GET(
    new Request(`http://site/api/search?q=${encodeURIComponent(query)}`),
  );
  expect(response.status).toBe(200);
  return (await response.json()) as SearchResponse & {
    data: {results: SiteSearchResult[]};
  };
}

// The API answers for the packages this build documents. On canary that is
// every configured integration, the same set `astryx search` reads here.
const documentsEveryIntegration =
  docsiteConfig.integrations.length === admittedRecord.packages.length;

describe('site search = astryx search', () => {
  it.skipIf(!documentsEveryIntegration)(
    'answers each query with the results `astryx search --json` prints',
    async () => {
      // A few CLI processes at a time, so a busy CI runner does not run out
      // of time starting all of them at once.
      const printed: SearchResponse[] = [];
      for (let i = 0; i < QUERIES.length; i += CLI_AT_ONCE) {
        printed.push(
          ...(await Promise.all(
            QUERIES.slice(i, i + CLI_AT_ONCE).map(async query => {
              const {stdout} = await run(ASTRYX, ['search', query, '--json'], {
                cwd: ROOT,
                maxBuffer: 16 * 1024 * 1024,
              });
              return JSON.parse(stdout) as SearchResponse;
            }),
          )),
        );
      }
      for (const [i, query] of QUERIES.entries()) {
        const {data} = await api(query);
        expect(data.results.length, query).toBeGreaterThan(0);
        const {results: siteResults, ...rest} = data;
        const results = siteResults as SiteSearchResult[];
        const {results: cliResults, ...cliRest} = printed[i].data;
        expect(rest, query).toEqual(cliRest);
        expect(
          results.map(
            ({
              href: _href,
              siteTitle: _siteTitle,
              siteCategory: _siteCategory,
              ...result
            }) => result,
          ),
          query,
        ).toEqual(cliResults);
      }
    },
    SLOW,
  );

  it('refuses an empty or overlong query', async () => {
    for (const q of ['', '   ', 'x'.repeat(201)]) {
      const response = await GET(
        new Request(`http://site/api/search?q=${encodeURIComponent(q)}`),
      );
      expect(response.status).toBe(400);
    }
  });
});

describe('site search links', () => {
  const pages = new Set([
    ...docTopics.map(topic => topic.topic),
    ...packages
      .map(p => p.name)
      .filter(name => !name.startsWith('@astryxdesign/theme-'))
      .map(name => name.replace('@astryxdesign/', '')),
  ]);
  const redirectTargets = new Set(Object.values(docRedirects));
  const components = new Set(links.components);
  const templates = new Set(links.templates);

  /** Whether the site serves this path. */
  const served = (href: string): boolean => {
    if (['/components', '/templates', '/themes', '/docs'].includes(href)) {
      return true;
    }
    if (redirectTargets.has(href)) {
      return true;
    }
    const [pathname] = href.split('#');
    const [, area, slug] = pathname.split('/');
    if (area === 'components') {
      return components.has(slug);
    }
    if (area === 'templates') {
      return templates.has(slug);
    }
    if (area === 'docs') {
      return pages.has(slug);
    }
    return false;
  };

  it(
    'opens a page the site has for every result of every query',
    async () => {
      for (const query of QUERIES) {
        for (const result of (await api(query)).data.results) {
          expect(
            served(result.href),
            `${query}: ${result.domain} ${result.name} -> ${result.href}`,
          ).toBe(true);
        }
      }
    },
    SLOW,
  );

  it("opens a section at its own guide's anchor when a page repeats its key", () => {
    // A namespace page holds several guides' sections, and section keys are
    // unique only within a guide. Group the guide-keyed entries by page and
    // key: each guide's copy must open its own anchor.
    const byKey = new Map<string, {starts: Set<string>; hrefs: Set<string>}>();
    for (const [key, href] of Object.entries(links.anchors)) {
      const [guide, section] = key.split('#');
      const page = href.split('#')[0];
      const target = links.redirects[guide];
      if (!target || target.split('#')[0] !== page) {
        continue;
      }
      const group = `${page} ${section}`;
      if (!byKey.has(group)) {
        byKey.set(group, {starts: new Set(), hrefs: new Set()});
      }
      // A namespace with no text of its own starts where its first guide does.
      byKey.get(group)!.starts.add(target);
      byKey.get(group)!.hrefs.add(href);
    }
    const repeated = [...byKey.entries()].filter(([, v]) => v.starts.size > 1);
    expect(
      repeated.length,
      'a page that repeats a section key',
    ).toBeGreaterThan(0);
    for (const [group, {starts, hrefs}] of repeated) {
      expect(hrefs.size, group).toBe(starts.size);
    }
  });

  it("opens an integration's non-showcase block at its exact component example", () => {
    const blocks = Object.entries(links.blocks).filter(
      ([key, page]) =>
        key.startsWith('-astryxdesign-') && page.includes('#example-'),
    );
    expect(blocks.length).toBeGreaterThan(0);
    for (const [key, page] of blocks) {
      const [, pkg, name] = /^-astryxdesign-([a-z]+)-(.+)$/.exec(key)!;
      expect(page, key).toContain(`#example-${key}`);
      expect(
        searchResultHref(
          {
            domain: 'template',
            kind: 'block',
            name,
            package: `@astryxdesign/${pkg}`,
          },
          links,
        ),
        key,
      ).toBe(page);
    }
  });

  it('folds a component showcase into the component destination', () => {
    expect(
      searchResultHref(
        {
          domain: 'template',
          kind: 'block',
          name: 'ButtonShowcase',
          package: '@astryxdesign/core',
        },
        links,
      ),
    ).toBe('/components/Button');
  });

  it('opens a Core non-showcase block at its exact component example', () => {
    expect(
      searchResultHref(
        {
          domain: 'template',
          kind: 'block',
          name: 'ButtonFloating',
          package: '@astryxdesign/core',
        },
        links,
      ),
    ).toBe('/components/Button#example-ButtonFloating');
  });

  it(
    'titles doc results the way the site does, never with the docs-tree path',
    async () => {
      for (const query of [
        'authoring',
        'how do I theme my app',
        'tokens spacing',
      ]) {
        for (const result of (await api(query)).data.results) {
          if (result.domain !== 'doc') {
            continue;
          }
          expect(result.siteTitle, `${query}: ${result.name}`).toBeTruthy();
          expect(result.siteTitle).not.toMatch(/Unorganized/);
          const expectedCategory = links.categories[result.href];
          if (expectedCategory) {
            expect(result.siteCategory, `${query}: ${result.name}`).toBe(
              expectedCategory,
            );
          }
        }
      }
    },
    SLOW,
  );

  it('carries the destination page category for search presentation', () => {
    expect(links.categories['/docs/tokens']).toBe('foundations');
    expect(links.categories['/docs/typography']).toBe('foundations');
    expect(links.categories['/docs/cli-component-lookups']).toBe('guide');
  });

  it('opens a doc section at its anchor', () => {
    const href = searchResultHref(
      {domain: 'doc', name: 'author-a-theme', section: 'palette'},
      links,
    );
    expect(href).toMatch(/^\/docs\/theme#/);
  });
});

describe('search panel order', () => {
  it(
    'keeps the CLI order: no groups, one item per place',
    async () => {
      const {data} = await api('button');
      const urls: string[] = [];
      const source = createCliSearchSource(async url => {
        urls.push(url);
        return new Response(JSON.stringify({data}));
      });
      expect(source.bootstrap()).toEqual([]);
      const items = await source.search('button');
      expect(urls).toEqual(['/api/search?q=button']);
      const results = data.results as SiteSearchResult[];
      const firstPerPlace = results.filter(
        (result, i) =>
          results.findIndex(other => other.href === result.href) === i,
      );
      expect(items.map(item => item.auxiliaryData.name)).toEqual(
        firstPerPlace.map(result => result.name),
      );
      expect(new Set(items.map(item => item.id)).size).toBe(items.length);
      for (const item of items) {
        expect(item.auxiliaryData).not.toHaveProperty('group');
        expect(source.item(item.id)).toBe(item);
      }
      expect(toSearchItem(data.results[0], 0).label).toBeTruthy();
    },
    SLOW,
  );

  it(
    'lists each place once, with rendered text no other row has',
    async () => {
      for (const query of [
        'dark mode',
        'authoring',
        'tokens spacing',
        'button variants',
        'banner statuses',
        'divider variants',
      ]) {
        const {data} = await api(query);
        const source = createCliSearchSource(
          async () => new Response(JSON.stringify({data})),
        );
        const items = await source.search(query);
        const hrefs = items.map(item => item.auxiliaryData.href);
        expect(new Set(hrefs).size, `${query}: ${hrefs}`).toBe(hrefs.length);
        const renderedText = items.map(item => {
          const {title, context} = searchResultPresentation(item.auxiliaryData);
          return `${title} · ${context}`;
        });
        expect(new Set(renderedText).size, `${query}: ${renderedText}`).toBe(
          renderedText.length,
        );
      }
    },
    SLOW,
  );

  it('reports a selection by what it opens, as the registries name it', () => {
    expect(searchTarget('/components/Button')).toEqual({
      item: 'Button',
      type: 'component',
    });
    expect(searchTarget('/docs/theme#dark-mode')).toEqual({
      item: 'theme',
      type: 'doc',
    });
    expect(searchTarget('/templates/login')).toEqual({
      item: 'login',
      type: 'template',
    });
    expect(searchTarget('/themes')).toEqual({item: 'themes', type: 'theme'});
  });

  it('sends only the last query typed', async () => {
    const urls: string[] = [];
    const source = createCliSearchSource(async (url, init) => {
      urls.push(url);
      if (init.signal?.aborted) {
        throw new Error('aborted');
      }
      return new Response(JSON.stringify({data: {results: []}}));
    });
    const first = source.search('bu');
    const second = source.search('button');
    expect(await first).toEqual([]);
    await second;
    expect(urls).toEqual(['/api/search?q=button']);
  });
});
