// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file In search's reading, a match whose name of two or more words the
 * query writes as one whole word leads the answer, alone or inside a longer
 * ask. Words written apart, one-word names, a typed word that only starts a
 * name, and a name inside a longer named run or inside a display name, title
 * or heading the query holds lead nothing. searchCore, which build reads,
 * keeps the gathered order. All entries here are made up.
 */

import {describe, expect, it} from 'vitest';
import {requireNatively} from '../../test-utils/native-require.mjs';

const require = requireNatively(import.meta.url);
/** @type {typeof import('./_named-keywords.mjs')} */
const {searchView} = require('./_named-keywords.mjs');
/** @type {typeof import('./_lexical.mjs')} */
const {rankLexical} = require('./_lexical.mjs');
/** @type {typeof import('./_order.mjs')} */
const {orderMatches} = require('./_order.mjs');
/** @type {typeof import('./_entries.mjs')} */
const {entryTable} = require('./_entries.mjs');
/** @type {typeof import('./_result.mjs')} */
const {namedLeadsOf} = require('./_result.mjs');

/** @typedef {import('./_lexical.mjs').Candidate} Candidate */

/** @type {Candidate} */
const Glim = {
  domain: 'component',
  name: 'Glim',
  keywords: ['glim', 'paging', 'rows'],
  description: 'Shows glim rows with paging.',
};
/** @type {Candidate} */
const GlimTray = {
  domain: 'component',
  name: 'GlimTray',
  keywords: ['tray', 'paging', 'sorted rows'],
  description: 'Holds glim rows in a tray, sorted, with paging.',
};
/** @type {Candidate} */
const sortedBlock = {
  domain: 'template',
  name: 'GlimTraySortedRows',
  keywords: ['GlimTray'],
  description: 'A tray of rows.',
  prose: [],
  _kind: 'block',
  _displayName: 'GlimTray — Sorted rows',
};
/** @type {Candidate} */
const board = {
  domain: 'template',
  name: 'glim-board',
  keywords: ['board', 'paging', 'example', 'sorted rows'],
  description: 'A glim board page with sorted rows, paging and an example.',
  prose: [],
  _kind: 'page',
};
/** @type {Candidate} */
const fluxColors = {
  domain: 'doc',
  name: 'guides/flux-colors',
  _topic: 'guides/flux-colors',
  titles: ['Palette picks', 'GlimTray tray heading'],
  keywords: [],
  description: 'Which flux colors to pick.',
};
/** @type {Candidate} */
const flux = {
  domain: 'doc',
  name: 'flux',
  _topic: 'flux',
  titles: ['Flux'],
  keywords: ['flux', 'colors', 'example'],
  description: 'Flux colors, with an example of each.',
};

const all = [Glim, GlimTray, sortedBlock, board, fluxColors, flux];

/** @param {Candidate[]} entries */
const catalog = entries => ({
  all: entries,
  components: entries.filter(c => c.domain === 'component'),
  searchedComponents: false,
});

/** @param {string} query */
const names = query =>
  rankLexical(query, {}, searchView(catalog(all))).data.results.map(
    r => r.name,
  );

/**
 * The names of the entries the query leads with by name, in search's
 * reading or the gathered one.
 * @param {string} query
 * @param {boolean} [view]
 */
const leadsOf = (query, view = true) => {
  const response = rankLexical(
    query,
    {},
    view ? searchView(catalog(all)) : catalog(all),
  );
  return [...(namedLeadsOf.get(response) ?? [])].map(
    r => /** @type {any} */ (r).name,
  );
};

describe('a name written as one word', () => {
  it('leads inside a longer ask, however the one word is written', () => {
    for (const query of [
      'GlimTraySortedRows with paging',
      'glim-tray-sorted-rows with paging',
      'glimtraysortedrows with paging',
      'glim_tray_sorted_rows with paging',
    ]) {
      expect(names(query)[0]).toBe('GlimTraySortedRows');
      expect(leadsOf(query)).toEqual(['GlimTraySortedRows']);
    }
  });

  it('leads over an entry that outscores it', () => {
    const view = rankLexical(
      'GlimTraySortedRows board paging example',
      {},
      searchView(catalog(all)),
    );
    const [first, ...rest] = view.data.results;
    expect(first.name).toBe('GlimTraySortedRows');
    expect(rest.some(r => (r.score ?? 0) > (first.score ?? 0))).toBe(true);
  });

  it("names a doc by its route's last part", () => {
    expect(leadsOf('flux-colors example')).toEqual(['guides/flux-colors']);
    expect(leadsOf('fluxcolors flux example')).toEqual(['guides/flux-colors']);
    expect(leadsOf('guidesfluxcolors flux example')).toEqual([
      'guides/flux-colors',
    ]);
    expect(names('fluxcolors flux example')[0]).toBe('guides/flux-colors');
    expect(names('flux-colors example')[0]).toBe('guides/flux-colors');
  });
});

describe('nothing leads', () => {
  it('for a name written as words apart', () => {
    expect(leadsOf('glim tray sorted rows with paging')).toEqual([]);
  });

  it('for a one-word name inside a longer ask', () => {
    expect(leadsOf('Glim board sorted rows paging example')).toEqual([]);
    expect(leadsOf('flux colors example board')).toEqual([]);
  });

  it('for a name the typed word only starts', () => {
    expect(leadsOf('GlimTraySortdRows with paging')).toEqual([]);
  });

  it('for a name inside a held display name', () => {
    expect(leadsOf('GlimTray — Sorted rows example')).toEqual([]);
    expect(leadsOf('GlimTray paging example')).toEqual(['GlimTray']);
  });

  it('for a name inside a held title, read as the title tier reads it', () => {
    expect(leadsOf('GlimTray — Sorted row example')).toEqual([]);
    expect(leadsOf('how do I pick palette GlimTray colors')).toEqual([
      'GlimTray',
    ]);
    expect(leadsOf('GlimTray tray heading example')).toEqual([]);
  });

  it('for a name inside a longer named run', () => {
    expect(leadsOf('glimtray board example')).toEqual(['GlimTray']);
    expect(leadsOf('GlimTray sorted rows example')).toEqual([]);
  });

  it('in the gathered reading, which build reads', () => {
    expect(leadsOf('GlimTraySortedRows sorted rows paging', false)).toEqual([]);
    expect(leadsOf('flux-colors example', false)).toEqual([]);
  });
});

describe('several names in one ask', () => {
  it('lead in their lexical order', () => {
    const query = 'GlimTray glim-board paging';
    expect(new Set(leadsOf(query))).toEqual(
      new Set(['GlimTray', 'glim-board']),
    );
    expect(new Set(names(query).slice(0, 2))).toEqual(
      new Set(['GlimTray', 'glim-board']),
    );
  });
});

describe('the order of matches', () => {
  it('keeps a named entry first, whatever the learned order says', () => {
    const query = 'GlimTraySortedRows sorted rows paging';
    const lexical = rankLexical(
      query,
      {limit: Number.MAX_SAFE_INTEGER},
      searchView(catalog(all)),
    );
    const table = entryTable(all, {});
    const reversed = all.map((_, i) => all.length - 1 - i);
    const ordered = orderMatches(table, reversed, lexical, query, 10);
    expect(ordered.data.results[0].name).toBe('GlimTraySortedRows');
  });
});
