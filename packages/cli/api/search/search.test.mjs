// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated tests for the `search` leaf (api/search/search.mjs), run
 * against the real @astryxdesign/core registry. `search` had no api-level tests;
 * this locks the envelope, ranking invariants, the `--type`/limit handling, and
 * the error paths.
 *
 * The API validates its own inputs (not just the CLI): a non-positive/non-integer
 * `limit`, an empty query, and a bad `--type` all throw AstryxError with the
 * ERR_INVALID_ARGUMENT code, so a direct `@astryxdesign/cli/api` caller gets the
 * same contract as `astryx search` on the command line.
 *
 * The last describe block covers integration-contributed components, using the
 * same temp-consumer harness as template-integration.test.mjs. Before this,
 * `search`/`build` only ever scanned @astryxdesign/core — an integration's own
 * components were invisible to both, even though `component --list` and
 * `component <Name>` already resolved them. The two discovery paths silently
 * disagreed.
 */

import {describe, it, expect} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {docs} from '../docs/docs.mjs';
import {listAvailableThemes} from '../theme/_adapter.mjs';
import {doc as themeAddCommandDoc} from '../../clients/cli/commands/theme-add.doc.mjs';
import {
  headingWithPhrase,
  titleInQuery,
  search,
  scoreCandidate,
  scoreQuery,
  tokenizeQuery,
  SEARCH_DOMAINS,
} from './search.mjs';
import {linkThisCliAsProjectCli} from '../../test-utils/release-fixtures.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const cwd = REPO;
const SLOW = 30_000;

describe('search leaf — envelope + ranking', () => {
  it('returns a `search` envelope with query + results', async () => {
    const r = await search('button', {cwd});
    expect(r.type).toBe('search');
    expect(r.data.query).toBe('button');
    expect(Array.isArray(r.data.results)).toBe(true);
    expect(r.data.results.length).toBeGreaterThan(0);
  }, SLOW);

  it('keeps tokenizer coverage out of the public result shape', async () => {
    const r = await search('table of contents', {cwd});
    expect(r.data.results.length).toBeGreaterThan(0);
    for (const result of r.data.results) {
      expect(result).not.toHaveProperty('matchedTerms');
      expect(result).not.toHaveProperty('queryTerms');
    }
  }, SLOW);

  it('returns an empty result set (not an error) for a no-match query', async () => {
    const r = await search('zzznomatch99', {cwd});
    expect(r.type).toBe('search');
    expect(r.data.results).toEqual([]);
  }, SLOW);

  it('defaults to at most 20 results', async () => {
    const r = await search('button', {cwd});
    expect(r.data.results.length).toBeLessThanOrEqual(20);
  }, SLOW);

  it('caps results to a positive limit', async () => {
    const r = await search('button', {cwd, limit: 2});
    expect(r.data.results.length).toBeLessThanOrEqual(2);
  }, SLOW);
});

describe('search leaf — per-domain result fields', () => {
  it('carries import for components and hooks, title for docs, displayName and kind for templates, displayName for themes', async () => {
    // `theme` reaches every domain, but a theme matches it only through its
    // description, a prose mention below every name and keyword hit, so read
    // the whole result list.
    const r = await search('theme', {cwd, limit: 400});
    expect(new Set(r.data.results.map(res => res.domain))).toEqual(
      new Set(SEARCH_DOMAINS),
    );
    for (const res of r.data.results) {
      expect(typeof res.command).toBe('string');
      expect(typeof res.description).toBe('string');
      if (res.domain === 'component' || res.domain === 'hook') {
        expect(res.import).toMatch(/\S/);
      } else if (res.domain === 'doc') {
        expect(res.title).toMatch(/\S/);
        const read = `astryx docs ${res.name}`;
        expect([read, `${read} --index`, `${read} ${res.section}`]).toContain(res.command);
      } else if (res.domain === 'template') {
        expect(res.displayName).toMatch(/\S/);
        expect(['page', 'block']).toContain(res.kind);
      } else if (res.domain === 'theme') {
        expect(res.displayName).toMatch(/\S/);
        expect(res.command).toBe(`astryx theme add ${res.name}`);
      }
    }
  }, SLOW);
});

describe('search leaf — docs at the grain a reader reads them', () => {
  it(
    'finds one section of a guide, and a docs-tree leaf by its own name',
    async () => {
      const guide = await search('when a codemod runs', {cwd, type: 'doc'});
      // Found by the section's own title, wherever the guide sits in the tree.
      const hit = guide.data.results
        .slice(0, 3)
        .find(result => result.section === 'which-codemods-run');
      expect(hit).toMatchObject({
        domain: 'doc',
        name: expect.stringMatching(/^authoring\/(?:.+\/)?codemods$/),
        title: expect.stringMatching(/ › Codemods › Choose when a codemod runs$/),
      });
      expect(hit.parent).toBe(`astryx docs ${hit.name} --index`);
      expect(hit.command).toBe(`astryx docs ${hit.name} which-codemods-run`);
      const block = await search('token-ref', {cwd});
      expect(block.data.results[0]).toMatchObject({
        name: 'authoring/field-reference',
        section: 'reference-doc',
        command: 'astryx docs authoring/field-reference reference-doc',
      });
      const fn = await search('assertResponse', {cwd, type: 'doc'});
      expect(fn.data.results[0]).toMatchObject({
        name: 'cli/api/functions/assert-response',
        title: 'Astryx CLI › API › Functions › assertResponse()',
        parent: 'astryx docs cli/api/functions',
        command: 'astryx docs cli/api/functions/assert-response',
      });
      expect(fn.data.results[0]).not.toHaveProperty('section');
    },
    SLOW,
  );

  it(
    'finds the integration guides for the ways people ask to make one',
    async () => {
      // "make", "build", and "an" are stopwords, so each of the first three
      // tokenizes to `integration` alone; the phrase still matches the
      // keywords and the title the guides declare. A namespace's own
      // keywords count, and a plural name is the name.
      for (const [query, route] of [
        ['make an integration', /^authoring$/],
        ['build an integration', /^authoring$/],
        ['create an integration', /^authoring$/],
        ['integration', /^authoring$/],
        ['publish an integration', /^authoring$/],
        // The troubleshooting guide, wherever the tree places it.
        ['troubleshoot integration', /^authoring\/(?:.+\/)?troubleshooting$/],
      ]) {
        const r = await search(query, {cwd, type: 'doc'});
        const names = r.data.results.slice(0, 3).map(result => result.name);
        expect(names.some(name => route.test(name)), `${query}: ${names.join(', ')}`).toBe(true);
      }
    },
    SLOW,
  );

  it(
    'gives a top-level namespace hit the topic list as its parent',
    async () => {
      for (const [query, route] of [['foundations', 'foundations'], ['Astryx CLI', 'cli']]) {
        const r = await search(query, {cwd, type: 'doc'});
        expect(r.data.results).toContainEqual(
          expect.objectContaining({
            name: route,
            command: `astryx docs ${route}`,
            parent: 'astryx docs',
          }),
        );
      }
    },
    SLOW,
  );

  it(
    'points a topic hit at its index, never a whole-topic read',
    async () => {
      // A guide the tree places, read from the tree rather than named.
      const {data: integrations} = await docs('authoring');
      const guide = integrations.slots
        .flatMap(slot => slot.children)
        .find(child => child.kind === 'generic').route;
      const r = await search(guide, {cwd, type: 'doc'});
      expect(r.data.results[0]).toMatchObject({
        name: guide,
        command: `astryx docs ${guide} --index`,
      });
      expect(r.data.results[0]).not.toHaveProperty('section');
    },
    SLOW,
  );

  it(
    'searches docs where @astryxdesign/core is not installed',
    async () => {
      const bare = fs.mkdtempSync(
        path.join(os.tmpdir(), 'astryx-search-bare-'),
      );
      try {
        const r = await search('assertResponse', {cwd: bare, type: 'doc'});
        expect(r.data.results[0].name).toBe(
          'cli/api/functions/assert-response',
        );
      } finally {
        fs.rmSync(bare, {recursive: true, force: true});
      }
    },
    SLOW,
  );
});

describe('search leaf — matchCount is the total, not the cap', () => {
  it('reports every match while `results` stays bounded by the limit', async () => {
    // The regression: `matchCount` used to be `results.length`, so a query
    // matching 57 things reported 20 — the cap read back as the answer. Any
    // consumer counting matches (the recorded run, a caller paginating) then
    // could not tell a capped answer from an exactly-cap-sized one.
    const capped = await search('button', {cwd, limit: 2});
    expect(capped.data.results.length).toBe(2);
    expect(capped.data.matchCount).toBeGreaterThan(2);

    // Same query, no meaningful cap: the count is stable across limits, which
    // is what makes it a count of MATCHES rather than of what was returned.
    const full = await search('button', {cwd, limit: 500});
    expect(full.data.matchCount).toBe(capped.data.matchCount);
    expect(full.data.results.length).toBe(full.data.matchCount);
  }, SLOW);

  it('reports 0 for a no-match query', async () => {
    const r = await search('zzznomatch99', {cwd});
    expect(r.data.matchCount).toBe(0);
  }, SLOW);

  it('counts only the requested domain under --type', async () => {
    const all = await search('button', {cwd, limit: 500});
    const components = await search('button', {
      cwd,
      type: 'component',
      limit: 500,
    });
    expect(components.data.matchCount).toBe(components.data.results.length);
    expect(components.data.matchCount).toBeLessThanOrEqual(all.data.matchCount);
  }, SLOW);
});

describe('search leaf — --type filter', () => {
  it('restricts results to the requested domain', async () => {
    const r = await search('button', {cwd, type: 'component'});
    expect(r.data.results.every(x => x.domain === 'component')).toBe(true);
  }, SLOW);

  it('exposes the valid domain list', () => {
    expect(SEARCH_DOMAINS).toEqual(expect.arrayContaining(['component', 'hook', 'doc', 'template']));
  });
});

describe('search leaf — exact keyword phrase outranks incidental token matches (issue #5239)', () => {
  it('surfaces Outline for its own declared keyword "table of contents", ranked first', async () => {
    // Before the fix, "table" and "contents" each separately matched dozens
    // of unrelated Table-related templates by coincidence, and their
    // combined token-sum score outranked Outline's single exact match,
    // pushing it out of the results entirely at the default limit.
    const r = await search('table of contents', {cwd});
    expect(r.data.results[0]?.name).toBe('Outline');
  }, SLOW);

  it('surfaces Outline for its own declared keyword "heading navigation", ranked first', async () => {
    const r = await search('heading navigation', {cwd});
    expect(r.data.results[0]?.name).toBe('Outline');
  }, SLOW);

  it('preserves query coverage metadata on the promoted exact phrase', () => {
    const query = 'table of contents';
    const tokens = tokenizeQuery(query);
    expect(
      scoreQuery(query, tokens, {
        name: 'Outline',
        keywords: [query],
      }),
    ).toMatchObject({matched: tokens.length, total: tokens.length});
  });

  it('still returns no results for a nonsense query (the fix does not loosen matching)', async () => {
    const r = await search('zzzzqqqx', {cwd});
    expect(r.data.results).toEqual([]);
  }, SLOW);
});

describe('search leaf — a whole-query phrase in a title or heading is top tier', () => {
  /**
   * @param {string} q
   * @param {object} candidate
   * @returns {number}
   */
  const score = (q, candidate) => scoreQuery(q, tokenizeQuery(q), candidate)?.score ?? 0;

  it('finds the whole query, in order, inside a title or heading', () => {
    expect(headingWithPhrase('dark mode', ['Light/Dark Mode'])).toBe('Light/Dark Mode');
    expect(headingWithPhrase('nested theme', ['Theme Props', 'Nested themes'])).toBe(
      'Nested themes',
    );
    // A plural on either side is the same word.
    expect(headingWithPhrase('data attributes selector', ['Data attribute selectors'])).toBe(
      'Data attribute selectors',
    );
    // Out of order, split up, or one word: not a phrase.
    expect(headingWithPhrase('mode dark', ['Light/Dark Mode'])).toBeNull();
    expect(headingWithPhrase('dark mode', ['Dark sidebar and mode toggle'])).toBeNull();
    expect(headingWithPhrase('dark', ['Light/Dark Mode'])).toBeNull();
    expect(headingWithPhrase('dark mode', undefined)).toBeNull();
  });

  it('ranks a section titled with the phrase above an exact code-tick match of one word', () => {
    // The reported miss: `search "dark mode"` put "Light/Dark Mode" at #28,
    // under API enum docs that name `mode` in code ticks.
    const section = {name: 'light-dark-mode', titles: ['Light/Dark Mode'], keywords: ['Light/Dark Mode']};
    const enumDoc = {name: 'response-types', keywords: ['mode', 'dark'], description: 'mode'};
    expect(score('dark mode', section)).toBe(170);
    expect(score('dark mode', section)).toBeGreaterThan(score('dark mode', enumDoc));
  });

  it('ranks a question that names a whole title just below that', () => {
    expect(titleInQuery('how do i add dark mode', ['Dark mode'])).toBe('Dark mode');
    expect(titleInQuery('how do nested themes work', ['Nested themes'])).toBe('Nested themes');
    // One-word titles are too common to count, and order still matters.
    expect(titleInQuery('how do i theme my app', ['Theme'])).toBeNull();
    expect(titleInQuery('mode dark please', ['Dark mode'])).toBeNull();
    const section = {name: 'light-dark-mode', titles: ['Dark mode'], keywords: ['Dark mode']};
    const named = score('how do i add dark mode', section);
    expect(named).toBeGreaterThanOrEqual(160);
    expect(named).toBeLessThan(170);
    // Sections that share a title are ordered by how much of the rest of the
    // question they answer.
    const spacing = {name: 'best-practices', titles: ['Best Practices'], prose: ['Use spacing tokens']};
    const color = {name: 'best-practices', titles: ['Best Practices'], prose: ['Use color tokens']};
    expect(score('best practices for spacing', spacing)).toBeGreaterThan(
      score('best practices for spacing', color),
    );
  });

  it('reads a plural of a name as the name, and only a real plural', () => {
    // One point under the exact spelling, so the doc named `tokens` outranks
    // the Token component for `tokens`.
    expect(scoreCandidate('integration', {name: 'integrations'})?.score).toBe(99);
    expect(scoreCandidate('box', {name: 'boxes'})?.score).toBe(99);
    expect(scoreCandidate('tabs', {name: 'tab'})?.score).toBe(99);
    expect(scoreCandidate('tokens', {name: 'tokens'})?.score).toBe(100);
    // `es` only follows s, x, z, ch, or sh.
    expect(scoreCandidate('not', {name: 'notes'})?.score ?? 0).toBeLessThan(100);
    expect(scoreCandidate('mod', {name: 'modes'})?.score ?? 0).toBeLessThan(100);
  });

  it('keeps an exact name or keyword above a title phrase', () => {
    const titled = {name: 'x', titles: ['Table of contents for long pages']};
    const keyword = {name: 'Outline', keywords: ['table of contents']};
    expect(score('table of contents', keyword)).toBeGreaterThan(score('table of contents', titled));
  });

  it('puts the dark mode section first for a docs search', async () => {
    for (const query of ['dark mode', 'how do I add dark mode']) {
      const r = await search(query, {cwd, type: 'doc'});
      // The topic-level hit and the section can tie; either is correct.
      const top = r.data.results[0];
      const hasDarkMode = top.section === 'light-dark-mode' ||
        top.name === 'use-a-theme' || top.name === 'theme';
      expect(hasDarkMode).toBe(true);
    }
  }, SLOW);
});

describe('search leaf — a candidate that matches every word outranks a partial match', () => {
  /**
   * @param {string} q
   * @param {object} candidate
   * @returns {number}
   */
  const score = (q, candidate) => scoreQuery(q, tokenizeQuery(q), candidate)?.score ?? 0;

  it('ranks a doc with both words above a doc named after one of them', () => {
    // The reported regression: `search troubleshoot integration` put the
    // troubleshooting guide 30th, under docs that each match `integration`
    // alone (by name, 108; in a code tick, 98).
    const guide = {
      name: 'troubleshooting',
      keywords: ['Troubleshooting'],
      description: 'What to check when an integration does not load.',
    };
    const byName = {name: 'integration', keywords: ['integration-add']};
    const byCodeTick = {name: 'integration-add', keywords: ['integration']};
    const q = 'troubleshoot integration';
    expect(score(q, guide)).toBeGreaterThan(score(q, byName));
    expect(score(q, guide)).toBeGreaterThan(score(q, byCodeTick));
    expect(scoreQuery(q, tokenizeQuery(q), guide)).toMatchObject({matched: 2, total: 2});
  });

  it('holds for longer queries too, and stays below the title tiers', () => {
    const all = {name: 'x', keywords: ['alphas'], description: 'alpha beta gamma delta'};
    const threeOfFour = {name: 'alpha', keywords: ['beta', 'gamma']};
    const q = 'alpha beta gamma delta';
    expect(score(q, all)).toBeGreaterThan(score(q, threeOfFour));
    expect(score(q, all)).toBeLessThan(160);
  });

  // Among candidates that match every word, the stronger match comes first:
  // the all-words tier uses total match quality (sum of token scores), not
  // just the strongest, so an exact keyword outranks a stem-form keyword.
  it('ranks the stronger of two all-word matches first', () => {
    const all = {name: 'x', keywords: ['alphas'], description: 'alpha beta gamma delta'};
    const q = 'alpha beta gamma delta';
    expect(score(q, {name: 'y', keywords: ['alpha'], description: 'beta gamma delta'})).toBeGreaterThan(
      score(q, all),
    );
  });

  it('keeps passing mentions of every word below an exact hit on one word', () => {
    // Mentions in prose, or the components a page happens to render, are
    // breadth: a page that says "empty state" is not the EmptyState answer.
    const mentions = {name: 'ai-chat-landing', description: 'A landing page with an empty state.'};
    const keyword = {name: 'x', keywords: ['empty']};
    expect(score('empty state', mentions)).toBeLessThan(score('empty state', keyword));
  });

  it('finds a component by its name typed as words, and a guide by its route', async () => {
    for (const [query, name] of [
      ['command palette', 'CommandPalette'],
      ['empty state', 'EmptyState'],
    ]) {
      const r = await search(query, {cwd});
      expect(r.data.results[0], query).toMatchObject({domain: 'component', name});
    }
    const tokens = await search('tokens', {cwd});
    expect(tokens.data.results[0]).toMatchObject({domain: 'doc', name: 'tokens'});
    for (const [query, route] of [
      ['codemods', /^authoring\/(?:.+\/)?codemods$/],
      ['quick start', /^authoring\/(?:.+\/)?quick-start$/],
      ['test in an app', /^authoring\/(?:.+\/)?test-in-an-app$/],
    ]) {
      const r = await search(query, {cwd, type: 'doc'});
      // The guide is among the hits that share the top score: two guides
      // that both declare the phrase tie, and the tie's order is not pinned.
      const top = r.data.results
        .filter(result => result.score === r.data.results[0].score)
        .map(result => result.name);
      expect(top.some(name => route.test(name)), `${query}: ${top.join(', ')}`).toBe(true);
    }
  }, SLOW);
});

describe('search leaf — error paths (pinned)', () => {
  it('throws ERR_INVALID_ARGUMENT when the query is empty/whitespace', async () => {
    await expect(search('   ', {cwd})).rejects.toMatchObject({
      code: 'ERR_INVALID_ARGUMENT',
      message: expect.stringMatching(/query is required/i),
    });
  }, SLOW);

  it('throws ERR_INVALID_ARGUMENT for an unknown --type', async () => {
    await expect(
      search('button', {cwd, type: /** @type {any} */ ('bogus')}),
    ).rejects.toMatchObject({code: 'ERR_INVALID_ARGUMENT'});
  }, SLOW);

  it('searches the docs without @astryxdesign/core, and throws for a domain that needs it', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-search-no-core-'));
    // A project whose own CLI answers, with no Core installed.
    linkThisCliAsProjectCli(empty);
    try {
      // An open search without Core covers the docs, as `astryx docs` does.
      const open = await search('make an integration', {cwd: empty});
      expect(open.data.results.length).toBeGreaterThan(0);
      expect(new Set(open.data.results.map(r => r.domain))).toEqual(
        new Set(['doc']),
      );
      for (const type of ['component', 'hook', 'template']) {
        await expect(
          search('button', {cwd: empty, type: /** @type {any} */ (type)}),
        ).rejects.toMatchObject({code: 'ERR_CORE_NOT_FOUND'});
      }
    } finally {
      fs.rmSync(empty, {recursive: true, force: true});
    }
  }, SLOW);
});

describe('search leaf — limit validation (API matches the CLI contract)', () => {
  it('throws ERR_INVALID_ARGUMENT for a limit of 0 (no longer returns everything)', async () => {
    await expect(search('button', {cwd, limit: 0})).rejects.toMatchObject({
      code: 'ERR_INVALID_ARGUMENT',
    });
  }, SLOW);

  it('throws ERR_INVALID_ARGUMENT for a negative limit', async () => {
    await expect(search('button', {cwd, limit: -5})).rejects.toMatchObject({
      code: 'ERR_INVALID_ARGUMENT',
    });
  }, SLOW);

  it('throws ERR_INVALID_ARGUMENT for a non-integer limit', async () => {
    await expect(search('button', {cwd, limit: 2.5})).rejects.toMatchObject({
      code: 'ERR_INVALID_ARGUMENT',
    });
  }, SLOW);
});

describe('search leaf — a theme is found by its names; its description is prose (AST-050 FR14)', () => {
  /** A result that answers the query by a name or a declared keyword, not a typo or a mention. */
  const matchesByNameOrKeyword = (/** @type {{reason: string}} */ result) =>
    /^(exact name|plural of the name|name "|name contains ")/.test(result.reason) ||
    /^keyword "[^"]*"$/.test(result.reason);

  /**
   * The `theme add` command AST-050 FR12 and FR13 name for the stage that
   * `theme add` itself declares: no `--import` yet, a deprecated copy default
   * beside `--import`, or the cleanup, which keeps `--import` and drops the
   * copy's `--overwrite`.
   * @param {string} slug
   */
  function themeAddCommandForStage(slug) {
    const flags = themeAddCommandDoc.options.flatMap(option => option.flag.split(/[\s,]+/));
    if (!flags.includes('--import')) return `astryx theme add ${slug}`;
    if (flags.includes('--overwrite')) return `astryx theme add --import ${slug}`;
    return `astryx theme add ${slug}`;
  }

  it(
    'ranks a theme found only through its description below every name and keyword match',
    async () => {
      for (const [query, slugs] of [
        ['focus', ['neutral']],
        ['content', ['matcha', 'neutral']],
      ]) {
        const {results} = (await search(query, {cwd, limit: 400})).data;
        const strong = results.filter(
          result => result.domain !== 'theme' && matchesByNameOrKeyword(result),
        );
        expect(strong.length).toBeGreaterThan(0);
        const lastStrong = Math.max(...strong.map(result => results.indexOf(result)));
        for (const slug of slugs) {
          const at = results.findIndex(result => result.domain === 'theme' && result.name === slug);
          expect(at).toBeGreaterThan(-1);
          expect(results[at].reason).toMatch(/^description mentions /);
          expect(at).toBeGreaterThan(lastStrong);
        }
      }
    },
    SLOW,
  );

  it(
    'scores a word in a theme description the same as a word in a component description',
    async () => {
      const {results} = (await search('minimal', {cwd, limit: 400})).data;
      const neutral = results.find(result => result.domain === 'theme' && result.name === 'neutral');
      const topNav = results.find(result => result.domain === 'component' && result.name === 'TopNav');
      expect(neutral?.reason).toMatch(/^description mentions /);
      expect(topNav?.reason).toMatch(/^description mentions /);
      expect(neutral?.score).toBe(topNav?.score);
    },
    SLOW,
  );

  it(
    'keeps a theme that matches every word only in its description below results with a keyword hit',
    async () => {
      // Overlay and Dialog declare `focus` and mention `content`; neutral only
      // mentions both, in "so the content stays the focus".
      const {results} = (await search('content focus', {cwd, limit: 400})).data;
      const neutral = results.findIndex(result => result.domain === 'theme' && result.name === 'neutral');
      expect(neutral).toBeGreaterThan(-1);
      for (const name of ['Overlay', 'Dialog']) {
        const at = results.findIndex(result => result.domain === 'component' && result.name === name);
        expect(at).toBeGreaterThan(-1);
        expect(at).toBeLessThan(neutral);
      }
    },
    SLOW,
  );

  it(
    'still finds a theme first by its slug or its display name',
    async () => {
      for (const query of ['neutral', 'Matcha', 'Y2K']) {
        const [first] = (await search(query, {cwd})).data.results;
        expect(first).toMatchObject({domain: 'theme', name: query.toLowerCase(), reason: 'exact name'});
      }
    },
    SLOW,
  );

  it('scores a display name with the same name signals as the slug', () => {
    const theme = {name: 'ocean', aliases: ['Ocean Blue'], description: 'Deep blues for calm reading.'};
    expect(scoreCandidate('ocean blue', theme)).toEqual(scoreCandidate('ocean', theme));
    expect(scoreCandidate('ocean blue', {...theme, aliases: []})?.score ?? 0).toBeLessThan(
      scoreCandidate('ocean', theme).score,
    );
  });

  it(
    'names the theme add command for the stage theme add declares',
    async () => {
      const themes = await listAvailableThemes(cwd);
      expect(themes.length).toBeGreaterThan(0);
      for (const {slug} of themes) {
        const {results} = (await search(slug, {cwd, type: 'theme'})).data;
        const result = results.find(entry => entry.name === slug);
        expect(result?.command).toBe(themeAddCommandForStage(slug));
      }
    },
    SLOW,
  );
});

describe('search leaf — components whose docs live in a family folder', () => {
  it("indexes a family member from its own entry, not the family's keywords", async () => {
    // HStack and VStack are documented in Stack's doc, whose keywords
    // (horizontal, vertical, row, column, ...) describe Stack.
    const reasons = async (/** @type {string} */ query) =>
      Object.fromEntries(
        (await search(query, {cwd, type: 'component'})).data.results.map(r => [
          r.name,
          r.reason,
        ]),
      );
    const column = await reasons('column');
    expect(column.HStack ?? '').not.toMatch(/keyword/);
    expect(column.VStack ?? '').not.toMatch(/keyword/);
    expect(column.Stack).toMatch(/keyword/);
    const vertical = (await search('vertical', {cwd, type: 'component'})).data.results.map(
      r => r.name,
    );
    expect(vertical.indexOf('VStack')).toBeGreaterThanOrEqual(0);
    if (vertical.includes('HStack')) {
      expect(vertical.indexOf('VStack')).toBeLessThan(vertical.indexOf('HStack'));
    }
  }, SLOW);

  it('ranks VStack, HStack and Heading first for their own names, with their own import', async () => {
    for (const name of ['VStack', 'HStack', 'Heading']) {
      const r = await search(name.toLowerCase(), {cwd, type: 'component'});
      expect(r.data.results[0]).toMatchObject({
        domain: 'component',
        name,
        import: `@astryxdesign/core/${name}`,
      });
    }
  }, SLOW);
});

describe('search leaf — integration components', () => {
  /**
   * A minimal consumer project: a stub `@astryxdesign/core` (so `findCoreDir`
   * resolves without needing the real package) plus an installed
   * `@acme/widgets` integration that contributes one component.
   */
  function makeConsumerWithIntegrationComponent() {
    const dir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-search-it-'));
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({name: 'consumer'}));
    fs.writeFileSync(
      path.join(dir, 'astryx.config.mjs'),
      `export default { integrations: ['@acme/widgets'] };\n`,
    );

    // Stub core: just needs to exist with an (empty) src/ so discoverComponents
    // doesn't throw. Its own component list is irrelevant to this test.
    const coreDir = path.join(dir, 'node_modules', '@astryxdesign', 'core');
    fs.mkdirSync(path.join(coreDir, 'src'), {recursive: true});

    const widgetsDir = path.join(dir, 'node_modules', '@acme', 'widgets');
    fs.mkdirSync(path.join(widgetsDir, 'components'), {recursive: true});
    fs.writeFileSync(
      path.join(widgetsDir, 'package.json'),
      JSON.stringify({name: '@acme/widgets', version: '1.0.0'}),
    );
    fs.writeFileSync(
      path.join(widgetsDir, 'astryx.integration.mjs'),
      `export default { components: './components' };\n`,
    );
    fs.writeFileSync(
      path.join(widgetsDir, 'components', 'FancyGizmo.doc.mjs'),
      `export default {
        type: 'component',
        name: 'FancyGizmo',
        keywords: ['gizmo', 'widget'],
        usage: {description: 'A fancy gizmo widget.'},
        props: [],
      };\n`,
    );
    fs.writeFileSync(
      path.join(widgetsDir, 'components', 'FancyGizmo.tsx'),
      `export function FancyGizmo() { return null; }\n`,
    );

    return dir;
  }

  it('includes a component contributed by a configured integration', async () => {
    const dir = makeConsumerWithIntegrationComponent();
    try {
      const r = await search('gizmo', {cwd: dir, type: 'component'});
      expect(r.data.results.some(x => x.name === 'FancyGizmo')).toBe(true);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  }, SLOW);

  it('reports the contributing package as the import hint', async () => {
    const dir = makeConsumerWithIntegrationComponent();
    try {
      const r = await search('FancyGizmo', {cwd: dir, type: 'component'});
      const hit = r.data.results.find(x => x.name === 'FancyGizmo');
      expect(hit?.import).toBe('@acme/widgets');
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  }, SLOW);
});

describe('search scoring — multi-token aggregation is monotonic', () => {
  /**
   * @param {string} q
   * @param {object} candidate
   * @returns {number}
   */
  const score = (q, candidate) => scoreQuery(q, tokenizeQuery(q), candidate)?.score ?? 0;

  it('ranks matching both terms above matching only the stronger one', () => {
    // The shipped regression: scoring averaged over MATCHED tokens, so the
    // weaker second hit pulled the mean down further than the coverage bonus
    // pushed it up. `build "file browser"` put two form wizards that matched
    // only "file" (98) above the actual file browser that matched both (97),
    // and 98 clears the confident-match gate.
    const partial = {name: 'form-wizard-vertical', keywords: ['file']};
    const complete = {
      name: 'file-explorer',
      keywords: ['file'],
      description: 'Column browser for nested folders',
    };
    expect(score('file browser', complete)).toBeGreaterThan(score('file browser', partial));
  });

  it('never scores a superset of matched terms below a subset', () => {
    const subset = {name: 'zzz-none', keywords: ['alpha']};
    const supersets = [
      {name: 'zzz-none', keywords: ['alpha'], description: 'beta things'},
      {name: 'zzz-none', keywords: ['alpha', 'beta']},
      {name: 'zzz-none', keywords: ['alpha'], weakKeywords: ['beta']},
    ];
    for (const superset of supersets) {
      expect(score('alpha beta', superset)).toBeGreaterThanOrEqual(score('alpha beta', subset));
    }
  });

  it('still scores a verbose prompt on the concepts it did hit', () => {
    // Guards the reason the mean was used: a long prompt matching one concept
    // strongly must not be crushed by dividing across every query token.
    const candidate = {name: 'kanban', keywords: ['kanban']};
    expect(score('i need a kanban somewhere in this rambling request', candidate))
      .toBeGreaterThanOrEqual(90);
  });
});

describe('search scoring — derived keywords rank below authored ones', () => {
  it('scores an authored keyword above a derived one', () => {
    const authored = scoreCandidate('dialog', {name: 'x', keywords: ['Dialog']});
    const derived = scoreCandidate('dialog', {name: 'x', weakKeywords: ['Dialog']});
    expect(authored?.score).toBe(90);
    expect(derived?.score).toBe(60);
  });

  it('keeps one incidental derived match below the confident-match gate', () => {
    // PAGE_DIRECT in api/build/kit is 95: at full keyword strength a page that
    // renders one of everything got a 90-point shot per component and was
    // returned as a confident match for queries it had nothing to do with.
    const derived = scoreCandidate('dialog', {name: 'x', weakKeywords: ['Dialog']});
    expect(derived?.score).toBeLessThan(95);
  });

  it('still surfaces a derived match above the page floor', () => {
    // PAGE_FLOOR is 50 — weakening the signal must not make it invisible.
    const derived = scoreCandidate('dialog', {name: 'x', weakKeywords: ['Dialog']});
    expect(derived?.score).toBeGreaterThanOrEqual(50);
  });

  it('explains a derived hit as something the template renders', () => {
    const derived = scoreCandidate('dialog', {name: 'x', weakKeywords: ['Dialog']});
    expect(derived?.reason).toMatch(/renders Dialog/);
  });
});

describe('search — usage guidance is indexed, a tier below description', () => {
  // The vocabulary a reader types usually lives in a component's guidance, not
  // in its one-line description. Banner calls itself "a persistent message";
  // only its best practices name "caution", "problems", "form errors". Before
  // this, none of those words found it.
  const banner = {
    name: 'Banner',
    keywords: ['alert', 'notification'],
    description: 'A persistent message shown above content.',
    guidance: [
      'Pick a status that matches the message: info for updates, warning for caution.',
      'Use error for problems the reader must resolve before continuing.',
    ],
  };

  it('finds a term that appears ONLY in guidance', () => {
    // Red before this change: guidance was never read, so this scored null.
    const hit = scoreCandidate('caution', banner);
    expect(hit).not.toBeNull();
    expect(hit?.reason).toMatch(/guidance mentions "caution"/);
  });

  it('scores guidance BELOW description, so a component about X outranks one that merely mentions X', () => {
    const own = scoreCandidate('persistent', banner);
    const mention = scoreCandidate('caution', banner);
    expect(own?.score).toBe(50);
    expect(mention?.score).toBe(45);
    expect(mention.score).toBeLessThan(own.score);
  });

  it('never lets guidance outrank a name or keyword hit', () => {
    expect(scoreCandidate('banner', banner)?.score).toBe(100);
    expect(scoreCandidate('notification', banner)?.score).toBe(90);
  });

  it('prefers the stronger signal when a term is in both description and guidance', () => {
    const both = scoreCandidate('message', banner);
    expect(both?.score).toBe(50);
    expect(both?.reason).toMatch(/description mentions/);
  });

  it('stays below MIN_TOKEN_SCORE, so guidance never counts as a matched CONCEPT', () => {
    // Measured regression this prevents: counting guidance as a matched term
    // moved `nested menu` from SideNav to List, and `explain why a field is
    // required` from Field to TextInput — in both cases a component whose
    // guidance happens to mention the other word displaced the real answer.
    // Guidance decides single-word queries; it must not win multi-word ones on
    // breadth. Same reason weakKeywords are capped.
    expect(scoreCandidate('caution', banner)?.score).toBeLessThan(50);
    // Both words are in this candidate's guidance and nowhere else, so if
    // guidance counted as a concept this would come back as a 2/2 match.
    const multi = scoreQuery('caution problems', tokenizeQuery('caution problems'), banner);
    expect(multi).toBeNull();
  });

  it('lets a real description hit still win the multi-word pass', () => {
    // The floor must exclude guidance without muting the tiers above it.
    const hit = scoreQuery('persistent message', tokenizeQuery('persistent message'), banner);
    expect(hit?.reason).toMatch(/matches 2\/2 terms/);
  });

  it('tolerates the object-shaped bestPractices entries core actually ships', () => {
    // Core writes `{guidance: true, description: '...'}`, not plain strings.
    const hit = scoreCandidate('resolve', {
      name: 'X',
      guidance: ['Use error for problems the reader must resolve.'],
    });
    expect(hit?.score).toBe(45);
  });
});

describe('search leaf — compound names, other names, and word forms', () => {
  it('finds a compound name typed as separate words inside a longer query', async () => {
    const {data} = await search('table header cell with sort arrow', {cwd});
    expect(
      data.results.slice(0, 3).map(r => r.name),
    ).toContain('TableHeaderCell');
  }, SLOW);

  it('finds a one-word keyword typed as separate words', async () => {
    // MetadataList declares `keyvalue`.
    const {data} = await search('key value pairs', {cwd});
    expect(data.results[0]).toMatchObject({
      domain: 'component',
      name: 'MetadataList',
    });
  }, SLOW);

  it('finds a hook named by its words without the `use` prefix', async () => {
    const {data} = await search('persisted table column settings', {cwd});
    expect(data.results[0]).toMatchObject({
      domain: 'hook',
      name: 'useTableColumnSettings',
    });
  }, SLOW);

  it('reads a camelCase identifier as the words it spells', async () => {
    const {data} = await search('useTablePaginationState', {cwd});
    expect(data.results[0]).toMatchObject({
      domain: 'hook',
      name: 'useTablePagination',
    });
  }, SLOW);

  it('keeps each identifier of a multi-word query whole', async () => {
    const {data} = await search('ChatMessageList ChatComposer', {cwd});
    expect(data.results.slice(0, 2).map(r => r.name).sort()).toEqual([
      'ChatComposer',
      'ChatMessageList',
    ]);
  }, SLOW);

  it("finds a component by another library's name for it", async () => {
    for (const [q, name] of [
      ['ScrollArea viewport', 'ScrollableArea'],
      ['toggle group of buttons', 'ToggleButtonGroup'],
      ['circular progress for uploads', 'Spinner'],
    ]) {
      const {data} = await search(q, {cwd});
      expect(data.results[0], q).toMatchObject({domain: 'component', name});
    }
  }, SLOW);

  it('reads a one-identifier other name as typed', async () => {
    const {data} = await search('AppHeader', {cwd});
    expect(data.results[0]).toMatchObject({
      domain: 'component',
      name: 'LayoutHeader',
    });
  }, SLOW);

  it('adds no near siblings beside an entry the query names outright', async () => {
    const {data} = await search('top nav mega menu', {cwd});
    expect(data.results[0]).toMatchObject({name: 'TopNavMegaMenu'});
    // Its sub-parts start with its name; read joined they would score in the
    // whole-name tier right under it.
    const siblings = data.results.filter(
      r => r.name !== 'TopNavMegaMenu' && r.name.startsWith('TopNavMegaMenu'),
    );
    for (const sibling of siblings) expect(sibling.score).toBeLessThan(190);
  }, SLOW);

  it('ranks an entry the query names above a match on part of another name', async () => {
    // `table header` names TableHeader; useTableStickyColumns only holds the
    // words `sticky columns`.
    const {data} = await search('table header with sticky columns', {cwd});
    const names = data.results.map(r => r.name);
    expect(names.indexOf('TableHeader')).toBeLessThan(
      names.indexOf('useTableStickyColumns') === -1
        ? Infinity
        : names.indexOf('useTableStickyColumns'),
    );
  }, SLOW);

  it('keeps an entry a query word names by its whole name at its own rank', async () => {
    // Two words join into TextInput, and TextArea also matches two words
    // through its joined keyword; one word is still TextArea's whole name.
    const {data} = await search('text input and textarea with multi line', {
      cwd,
    });
    expect(data.results[0]).toMatchObject({name: 'TextArea'});
  }, SLOW);

  it('ranks a match on more of the query above a shorter named entry', async () => {
    const {data} = await search('dropdown menu radio options', {cwd});
    expect(data.results[0]).toMatchObject({name: 'DropdownMenuRadioItem'});
  }, SLOW);

  it('lets a plural start a name through its singular', () => {
    expect(
      scoreCandidate('tokens', {domain: 'component', name: 'Tokenizer'}),
    ).toMatchObject({score: 60});
  });

  it('finds Icon by a glyph name', async () => {
    for (const q of ['cog', 'lightning bolt']) {
      const {data} = await search(q, {cwd});
      expect(data.results[0], q).toMatchObject({
        domain: 'component',
        name: 'Icon',
      });
    }
  }, SLOW);

  it('matches a verb form against its verb', () => {
    // "spacing" lost the final e of "space".
    expect(
      scoreCandidate('spacing', {domain: 'component', name: 'Gap', keywords: ['space']}),
    ).toMatchObject({score: 88});
    expect(
      scoreCandidate('dragging', {domain: 'component', name: 'Gap', keywords: ['drag']}),
    ).toMatchObject({score: 88});
  });

  it('lets a plural start a longer word through its singular', () => {
    expect(
      scoreCandidate('chips', {domain: 'component', name: 'Chipset'}),
    ).toMatchObject({score: 60});
    // A four-letter singular is too short: "stats" does not start "statusbar".
    expect(
      scoreCandidate('stats', {domain: 'component', name: 'Statusbar'}),
    ).toBeNull();
  });

  it('leaves an identifier joined with _ unmatched when nothing has it', async () => {
    const {data} = await search('qqzz_no_match_here', {cwd});
    expect(data.results).toEqual([]);
  }, SLOW);
});
