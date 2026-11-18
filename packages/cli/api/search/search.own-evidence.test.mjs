// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file In search's view, another entry's name is that entry's evidence. A
 * component a block uses never answers a query word for the block alone, so it
 * never lifts the block into the every-word tier; it still makes a word the
 * block answers itself stronger. A doc's title inside the query does not take
 * the title tier when a query word it leaves unanswered names a component or
 * hook, unless that word is also a doc's name. searchCore, which build reads,
 * keeps both as gathered. The in-band order still reads a block's used
 * components as its docs text. All entries here are made up.
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
/** @type {typeof import('./_entries.mjs')} */
const {buildTable} = require('./_entries.mjs');
/** @type {typeof import('./_titles.mjs')} */
const {TITLE_IN_QUERY_SCORE} = require('./_titles.mjs');

/** @typedef {import('./_lexical.mjs').Candidate} Candidate */

/**
 * @param {string} name
 * @param {Partial<Candidate>} [rest]
 * @returns {Candidate}
 */
const component = (name, rest = {}) => ({
  domain: 'component',
  name,
  keywords: [],
  description: '',
  ...rest,
});

/**
 * A block whose doc lists the components it uses, as the gatherer builds it.
 * @param {string} name
 * @param {string[]} uses
 * @param {string} description
 * @returns {Candidate}
 */
const block = (name, uses, description) =>
  /** @type {Candidate} */ ({
    domain: 'template',
    name,
    keywords: [...uses],
    _uses: [...uses],
    description,
    prose: [],
    _kind: 'block',
  });

/**
 * @param {Candidate[]} all
 */
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
const first = response => response.data.results[0]?.name;

describe('a component a block uses', () => {
  const Quiver = component('Quiver', {description: 'Holds a spool.'});
  const Spool = component('Spool', {keywords: ['reel']});
  const rack = block('SpoolRack', ['Spool', 'Quiver'], 'A rack of shelves.');
  const both = block(
    'ReelTray',
    ['Spool', 'Quiver'],
    'A tray that holds a spool and a quiver.',
  );
  const all = [Quiver, Spool, rack, both];

  it('never answers a query word for the block alone', () => {
    const view = rankLexical('spool quiver', {}, searchView(catalog(all)));
    expect(scoreOf(view, 'SpoolRack')).toBeLessThan(FULL_COVERAGE_SCORE);
    expect(scoreOf(view, 'Quiver')).toBeGreaterThanOrEqual(FULL_COVERAGE_SCORE);
  });

  it('still makes a word the block answers itself stronger', () => {
    const view = rankLexical('spool quiver', {}, searchView(catalog(all)));
    expect(scoreOf(view, 'ReelTray')).toBeGreaterThanOrEqual(
      FULL_COVERAGE_SCORE,
    );
  });

  it("counts a word that starts a word of the block's own name as its own answer", () => {
    const view = rankLexical('spoo rack', {}, searchView(catalog(all)));
    expect(scoreOf(view, 'SpoolRack')).toBeGreaterThanOrEqual(
      FULL_COVERAGE_SCORE,
    );
  });

  it('counts a word of its own display name as its own answer', () => {
    const Reel = component('Reel');
    const shown = /** @type {Candidate} */ ({
      ...block('TallShelf', ['Reel'], 'Holds things up high.'),
      _displayName: 'Reel — Tall shelf',
    });
    const view = rankLexical(
      'Reel — Tall shelf',
      {},
      searchView(catalog([Reel, shown])),
    );
    expect(scoreOf(view, 'TallShelf')).toBeGreaterThanOrEqual(
      FULL_COVERAGE_SCORE,
    );
  });

  it('keeps its own answer when a used component wins on a synonym', () => {
    const Gallery = component('Gallery');
    const strip = block('ZorbStrip', ['Gallery'], 'A zorb strip of photos.');
    const view = rankLexical(
      'photos zorb',
      {},
      searchView(catalog([Gallery, strip])),
    );
    expect(scoreOf(view, 'ZorbStrip')).toBeGreaterThanOrEqual(
      FULL_COVERAGE_SCORE,
    );
  });

  it('keeps matching: the block still answers the words it uses', () => {
    const view = rankLexical('quiver', {}, searchView(catalog(all)));
    expect(view.data.results.map(r => r.name)).toContain('SpoolRack');
  });

  it('counts as a keyword in the gathered catalog, as searchCore and build read it', () => {
    const raw = rankLexical('spool quiver', {}, catalog(all));
    expect(scoreOf(raw, 'SpoolRack')).toBeGreaterThanOrEqual(
      FULL_COVERAGE_SCORE,
    );
  });

  it('stays in the text the in-band order reads', () => {
    const fields = /** @param {Candidate[]} c */ c =>
      buildTable(c, {}).fields.desc;
    const raw = fields(all);
    const view = fields(searchView(catalog(all)).all);
    expect(view.len).toEqual(raw.len);
    expect([...view.post.get('quiver')]).toEqual([...raw.post.get('quiver')]);
  });

  it('leaves the gathered candidate as it is', () => {
    searchView(catalog(all));
    expect(rack.keywords).toEqual(['Spool', 'Quiver']);
  });
});

describe('a title inside the query', () => {
  const Drawl = component('Drawl', {keywords: ['panel', 'slat']});
  const guide = /** @type {Candidate} */ ({
    domain: 'doc',
    name: 'layout/slat-panels',
    keywords: ['slat panel'],
    titles: ['Slat panels'],
    description: '',
  });

  it('does not take the title tier past a component the query names', () => {
    const view = rankLexical(
      'drawl slat panels',
      {},
      searchView(catalog([Drawl, guide])),
    );
    expect(scoreOf(view, 'layout/slat-panels')).toBeLessThan(
      TITLE_IN_QUERY_SCORE,
    );
    expect(first(view)).toBe('Drawl');
  });

  it('takes the title tier when no unanswered word names an entry', () => {
    const view = rankLexical(
      'wide slat panels',
      {},
      searchView(catalog([Drawl, guide])),
    );
    expect(scoreOf(view, 'layout/slat-panels')).toBeGreaterThanOrEqual(
      TITLE_IN_QUERY_SCORE,
    );
  });

  it('takes the title tier when the named word is also a doc name', () => {
    const drawlDoc = /** @type {Candidate} */ ({
      domain: 'doc',
      name: 'drawl',
      keywords: [],
      titles: ['Drawl'],
      description: '',
    });
    const view = rankLexical(
      'drawl slat panels',
      {},
      searchView(catalog([Drawl, guide, drawlDoc])),
    );
    expect(scoreOf(view, 'layout/slat-panels')).toBeGreaterThanOrEqual(
      TITLE_IN_QUERY_SCORE,
    );
  });

  it('keeps a guide whose title is its only answer below a component the query names, as a match', () => {
    const titleOnly = /** @type {Candidate} */ ({
      domain: 'doc',
      name: 'guides/slat-check',
      keywords: [],
      titles: ['Slat check'],
      description: '',
    });
    const view = rankLexical(
      'drawl slat check',
      {},
      searchView(catalog([Drawl, titleOnly])),
    );
    expect(scoreOf(view, 'guides/slat-check')).toBeLessThan(
      TITLE_IN_QUERY_SCORE,
    );
    expect(first(view)).toBe('Drawl');
  });

  it('takes the title tier when the named word is in the title itself', () => {
    const drawlGuide = /** @type {Candidate} */ ({
      domain: 'doc',
      name: 'drawl-guide',
      keywords: [],
      titles: ['Drawl guide'],
      description: 'Steps to follow.',
    });
    const view = rankLexical(
      'drawl guide steps',
      {},
      searchView(catalog([Drawl, drawlGuide])),
    );
    expect(scoreOf(view, 'drawl-guide')).toBeGreaterThanOrEqual(
      TITLE_IN_QUERY_SCORE,
    );
  });

  it('keeps the title tier in the gathered catalog, as searchCore and build read it', () => {
    const raw = rankLexical('drawl slat panels', {}, catalog([Drawl, guide]));
    expect(scoreOf(raw, 'layout/slat-panels')).toBeGreaterThanOrEqual(
      TITLE_IN_QUERY_SCORE,
    );
  });
});
