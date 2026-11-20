// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file In search's view, a doc that opens a level (a docs-tree namespace)
 * sums up the docs beneath it. A word its text (prose, or a code term or
 * table cell its keywords gather) shares with one of those docs, answered by
 * that doc at least as strongly, is that doc's evidence: the page does not
 * answer it through that text. Its name, title, description and declared
 * keywords stay its own, and so does any word only it carries. searchCore,
 * which build reads, keeps the gathered reading. All entries here are made up.
 */

import {describe, expect, it} from 'vitest';
import {requireNatively} from '../../test-utils/native-require.mjs';

const require = requireNatively(import.meta.url);
/** @type {typeof import('./_named-keywords.mjs')} */
const {searchView} = require('./_named-keywords.mjs');
/** @type {typeof import('./_lexical.mjs')} */
const {rankLexical} = require('./_lexical.mjs');
/** @type {typeof import('./_score.mjs')} */
const {FULL_COVERAGE_SCORE} = require('./_score.mjs');

/** @typedef {import('./_lexical.mjs').Candidate} Candidate */

/**
 * @param {string} route
 * @param {Partial<Candidate>} rest
 * @returns {Candidate}
 */
const doc = (route, rest) =>
  /** @type {Candidate} */ ({
    domain: 'doc',
    name: route,
    keywords: [],
    description: '',
    prose: [],
    titles: [],
    _topic: route,
    _command: `astryx docs ${route}`,
    ...rest,
  });

/** @param {Candidate[]} all */
const catalog = all => ({
  all,
  components: all.filter(c => c.domain === 'component'),
  searchedComponents: false,
});

/**
 * @param {ReturnType<typeof rankLexical>} response
 * @param {string} name
 */
const scoreOf = (response, name) =>
  response.data.results.find(r => r.name === name)?.score;

/** @param {ReturnType<typeof rankLexical>} response */
const names = response => response.data.results.map(r => r.name);

// The overview inlines its guide's rules; the guide has them too.
const overview = doc('wharf', {
  keywords: ['wharf', 'bollard'],
  _declared: [],
  titles: ['Wharf'],
  description: 'How a wharf is laid out.',
  prose: [
    'Moorings: tie each skiff to a berth with a bollard.',
    'Only this page names the beacon.',
  ],
});
const moorings = doc('wharf/moorings', {
  keywords: ['moorings', 'bollard'],
  titles: ['Moorings'],
  prose: ['Tie each skiff to a berth with a bollard.'],
  _parent: 'astryx docs wharf',
});
const Skiff = /** @type {Candidate} */ ({
  domain: 'component',
  name: 'Skiff',
  keywords: ['berth'],
  description: 'A small boat.',
});
const all = [overview, moorings, Skiff];

describe('a doc that opens a level', () => {
  it('does not answer a word through text a doc beneath it answers', () => {
    const view = rankLexical(
      'skiff berth bollard',
      {},
      searchView(catalog(all)),
    );
    expect(scoreOf(view, 'wharf')).toBeUndefined();
    expect(names(view)[0]).not.toBe('wharf');
  });

  it('keeps every word in the gathered catalog, as searchCore and build read it', () => {
    const raw = rankLexical('skiff berth bollard', {}, catalog(all));
    expect(scoreOf(raw, 'wharf')).toBeGreaterThanOrEqual(FULL_COVERAGE_SCORE);
  });

  it('answers a word only its own text carries', () => {
    const view = rankLexical('beacon', {}, searchView(catalog(all)));
    expect(names(view)).toContain('wharf');
  });

  it('keeps its name and description', () => {
    expect(names(rankLexical('wharf', {}, searchView(catalog(all))))[0]).toBe(
      'wharf',
    );
    expect(names(rankLexical('laid', {}, searchView(catalog(all))))).toContain(
      'wharf',
    );
  });

  it('keeps a word a doc beneath it answers only more weakly', () => {
    // The guide only mentions `bollard` in prose; the page gathers it as a
    // code term, a stronger hit, so the hit stays the page's.
    const weak = doc('wharf/moorings', {
      titles: ['Moorings'],
      prose: ['Tie each skiff with a bollard.'],
    });
    const view = rankLexical(
      'bollard',
      {},
      searchView(catalog([overview, weak])),
    );
    expect(scoreOf(view, 'wharf')).toBeGreaterThan(
      /** @type {number} */ (scoreOf(view, 'wharf/moorings')),
    );
  });

  it('reads only the docs under its route, not a route that starts the same', () => {
    const neighbour = doc('wharfside/moorings', {
      titles: ['Moorings'],
      prose: ['Tie each skiff to a berth with a bollard.'],
    });
    const view = rankLexical(
      'berth',
      {},
      searchView(catalog([overview, neighbour])),
    );
    expect(names(view)).toContain('wharf');
  });

  it('leaves the gathered candidate as it is', () => {
    searchView(catalog(all));
    expect(Object.keys(overview)).not.toContain('_summarizes');
    expect(/** @type {any} */ (overview)._summarizes).toBeUndefined();
  });
});
