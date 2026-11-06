// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Domain priority in `search` ranking (api/search/search.mjs), run
 * against the real docs tree and @astryxdesign/core registry.
 *
 * Splitting a large doc into smaller topics gives each topic its own keywords
 * and headings, and a doc keyword or heading that holds the whole query scores
 * 170-190, above a component that matches one word by keyword (98). Every
 * split then puts another doc above the component a reader asked for. Domain
 * priority ranks a component, hook, template, or theme that a query word hits
 * by name or keyword ahead of docs the reader did not ask for, and keeps a doc
 * the query names, or whose title the query holds, where it was.
 *
 * Both directions are asserted together, so neither can be traded for the
 * other: component queries find the component first, and the obvious question
 * for each guide still finds that guide first.
 */

import {describe, it, expect} from 'vitest';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {docs} from '../docs/docs.mjs';
import {domainPriority, search, scoreQuery, tokenizeQuery} from './search.mjs';

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const cwd = REPO;
const SLOW = 30_000;

/**
 * @param {string} q
 * @param {object} candidate
 * @returns {0 | 1 | 2}
 */
const priority = (q, candidate) => {
  const tokens = tokenizeQuery(q);
  const hit = scoreQuery(q, tokens, candidate) ?? {
    score: 0,
    matched: 0,
    total: 1,
  };
  return domainPriority(q, tokens, /** @type {any} */ (candidate), hit);
};

/**
 * Every placed guide under a namespace, walked through `docs`.
 * @param {string} route
 * @param {Set<string>} [seen]
 * @returns {Promise<string[]>}
 */
async function placedGuides(route, seen = new Set()) {
  /** @type {any} */
  let node;
  try {
    node = (await docs(route)).data;
  } catch {
    return [];
  }
  /** @type {string[]} */
  const out = [];
  for (const child of (node.slots ?? []).flatMap(
    (/** @type {any} */ slot) => slot.children,
  )) {
    if (!child.route || seen.has(child.route)) continue;
    seen.add(child.route);
    if (child.kind === 'generic' && child.route.includes('/')) {
      out.push(child.route);
    }
    out.push(...(await placedGuides(child.route, seen)));
  }
  return out;
}

describe('search domain priority — the rule', () => {
  it('gives a doc no priority for a heading match or a one-word keyword', () => {
    const topic = {
      domain: 'doc',
      name: 'typography/font-setup',
      keywords: ['size'],
      titles: ['Font Setup', 'Font Sizes'],
    };
    expect(priority('font size', topic)).toBe(0);
    expect(priority('size', topic)).toBe(0);
  });

  it('gives a doc priority when the query is one of its declared keywords', () => {
    const guide = {
      domain: 'doc',
      name: 'guides/quality',
      titles: ['Is my code good?'],
      keywords: ['code review', 'review my code'],
      _declared: ['code review', 'review my code'],
    };
    expect(priority('code review', guide)).toBe(1);
    expect(priority('Code Reviews', guide)).toBe(1);
    expect(priority('review my code', guide)).toBe(1);
    // A section's keywords are its headings and code terms.
    const section = {
      ...guide,
      name: 'before-you-ship',
      _topic: 'guides/quality',
      _section: 'before-you-ship',
    };
    expect(priority('code review', section)).toBe(0);
  });

  it("gives a doc no priority for a code term or table cell it didn't declare", () => {
    // A typed doc's keywords hold the first column of its tables and the code
    // terms its text mentions; `missing_field` reads as two words.
    const reference = {
      domain: 'doc',
      name: 'cli/api/functions/validate-integration',
      titles: ['validateIntegration'],
      keywords: ['validate-integration', 'missing_field', 'file required'],
      _declared: [],
      _topic: 'cli/api/functions/validate-integration',
    };
    expect(priority('missing field', reference)).toBe(0);
    expect(priority('file required', reference)).toBe(0);
    expect(
      priority('missing field', {...reference, _declared: ['missing field']}),
    ).toBe(1);
  });

  it('keeps a component the query names exactly above a doc that declares it', async () => {
    const tokens = tokenizeQuery('empty state');
    const component = {domain: 'component', name: 'EmptyState'};
    const doc = {
      domain: 'doc',
      name: 'illustrations',
      keywords: ['empty state'],
      _declared: ['empty state'],
    };
    const c = scoreQuery('empty state', tokens, component);
    const d = scoreQuery('empty state', tokens, doc);
    expect(
      domainPriority('empty state', tokens, /** @type {any} */ (component), c),
    ).toBe(1);
    expect(
      domainPriority('empty state', tokens, /** @type {any} */ (doc), d),
    ).toBe(1);
    // Both have priority, so the stronger match wins: the exact name.
    expect(c?.score).toBeGreaterThan(d?.score ?? 0);
  });

  it('gives a doc priority when the query names it', () => {
    const topic = {domain: 'doc', name: 'typography/font-setup'};
    // The whole query spells its last route segment.
    expect(priority('font setup', topic)).toBe(2);
    expect(priority('typography/font-setup', topic)).toBe(2);
    // A word of a longer query is a flat topic's name, or its plural.
    expect(
      priority('product illustration', {domain: 'doc', name: 'illustrations'}),
    ).toBe(1);
  });

  it('names a doc by its route or title whatever the plural', () => {
    const guide = {
      domain: 'doc',
      name: 'layout/side-panels',
      titles: ['Side panels'],
    };
    expect(priority('side panel', guide)).toBe(2);
    expect(priority('side panels', guide)).toBe(2);
    expect(priority('side panels', {...guide, name: 'layout/side-panel'})).toBe(
      2,
    );
    // The topic's own title names it even where the route words differ.
    const titled = {
      domain: 'doc',
      name: 'guides/lookups',
      titles: ['Looking up components'],
    };
    expect(priority('looking up component', titled)).toBe(2);
    // A section's title is a heading inside its topic, not the topic's name.
    const section = {
      domain: 'doc',
      name: 'font-sizes',
      _topic: 'typography',
      _section: 'font-sizes',
      titles: ['Font Sizes'],
    };
    expect(priority('font size', section)).toBe(0);
  });

  it('names a section by its topic', () => {
    // A section candidate's own name is its section key; the reader names the
    // topic it belongs to.
    const section = {
      domain: 'doc',
      name: 'drop-shadows',
      _topic: 'elevation',
      titles: ['Drop shadows'],
      keywords: ['Drop shadows'],
    };
    expect(priority('elevation', section)).toBe(2);
    expect(priority('elevation for a raised tile', section)).toBe(1);
  });

  it('gives a doc priority when the query holds one of its titles whole', () => {
    const guide = {
      domain: 'doc',
      name: 'layout/side-panels',
      titles: ['Side panels'],
    };
    expect(priority('resizable side panels with a toolbar', guide)).toBe(1);
  });

  it('gives a doc that matches every word priority only when its title names one', () => {
    const titled = {
      domain: 'doc',
      name: 'use-a-theme',
      titles: ['Use a theme'],
      keywords: ['switcher', 'night'],
      description: 'Apply a theme to your app.',
    };
    expect(priority('night theme switcher', titled)).toBe(1);
    // A reference page that holds every word, but whose title names none.
    const reference = {
      domain: 'doc',
      name: 'api/reference',
      titles: ['Response shapes'],
      keywords: ['switcher', 'night', 'theme'],
    };
    expect(priority('night theme switcher', reference)).toBe(0);
  });

  it('gives a component priority for a name or keyword hit, not for prose', () => {
    expect(
      priority('font size', {
        domain: 'component',
        name: 'Text',
        keywords: ['font'],
      }),
    ).toBe(1);
    expect(
      priority('date picker', {domain: 'component', name: 'DatePicker'}),
    ).toBe(1);
    expect(
      priority('font size', {
        domain: 'component',
        name: 'Card',
        description: 'A surface whose font size follows its parent.',
      }),
    ).toBe(0);
  });
});

describe('search domain priority — real docs and components', () => {
  it(
    'finds a guide that declares the whole phrase above a component that matches one word',
    async () => {
      const results = (await search('font size', {cwd})).data.results;
      expect(results[0]).toMatchObject({domain: 'doc'});
      expect(results[0].name).toMatch(/^typography(?:\/|$)/);
      // The component the phrase points to stays near the top.
      expect(
        results
          .slice(0, 3)
          .some(r => r.domain === 'component' && r.name === 'Text'),
      ).toBe(true);
    },
    SLOW,
  );

  it(
    'keeps a component above a reference doc whose table or code terms hold the phrase',
    async () => {
      for (const q of ['missing field', 'file required']) {
        const [top] = (await search(q, {cwd})).data.results;
        expect(top, q).toMatchObject({domain: 'component', name: 'Field'});
      }
    },
    SLOW,
  );

  it(
    'opens the guide that answers a declared phrase, not one that only mentions it',
    async () => {
      const [layers] = (await search('cascade layers', {cwd})).data.results;
      expect(layers).toMatchObject({
        domain: 'doc',
        name: 'migration/migration-setup',
      });
      const [keyboard] = (await search('keyboard navigation', {cwd})).data
        .results;
      expect(keyboard?.name).not.toBe('migration/migration-verification');
    },
    SLOW,
  );

  it(
    'keeps a component above docs that match only by a heading, with scores unchanged',
    async () => {
      const results = (await search('font size', {cwd})).data.results;
      const text = results.findIndex(
        r => r.domain === 'component' && r.name === 'Text',
      );
      expect(text).toBeGreaterThanOrEqual(0);
      // A doc below Text outscores it on text alone: priority moved it, not the score.
      expect(
        results
          .slice(text + 1)
          .some(r => r.domain === 'doc' && r.score > results[text].score),
      ).toBe(true);
    },
    SLOW,
  );

  it(
    'still finds a flat guide first by its name',
    async () => {
      for (const [q, name] of [
        ['motion', 'motion'],
        ['icons', 'icons'],
        ['tokens', 'tokens'],
        ['illustration', 'illustrations'],
        ['use a theme', 'use-a-theme'],
        ['author a theme', 'author-a-theme'],
      ]) {
        const results = (await search(q, {cwd})).data.results;
        expect(results[0], q).toMatchObject({domain: 'doc', name});
      }
    },
    SLOW,
  );

  it(
    'still finds each layout guide first by its own name',
    async () => {
      // Each search reads the whole index, so this checks one split namespace
      // (layout, six guides) rather than every guide in the tree.
      const guides = await placedGuides('layout');
      expect(guides).toContain('layout/layout-spacing');
      /** @type {string[]} */
      const misses = [];
      for (const route of guides) {
        const q = route.slice(route.lastIndexOf('/') + 1).replace(/-/g, ' ');
        const top = (await search(q, {cwd})).data.results[0];
        if (top?.domain !== 'doc' || top.name !== route) {
          misses.push(`${q} -> ${top?.domain}:${top?.name}`);
        }
      }
      expect(misses).toEqual([]);
    },
    SLOW,
  );
});
