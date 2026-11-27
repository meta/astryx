// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file In search's reading, a match whose name of two or more words the
 * query writes as one whole word leads the answer, alone or inside a longer
 * ask. A name of three or more words the query spells out as words apart, as
 * is or with a typo the scorer reads, leads its run of matches. Two words
 * apart, one-word names, a typed word that only starts a name, and a name
 * inside a longer named run or inside another entry's display name, title or
 * heading the query holds lead nothing. searchCore, which build reads,
 * keeps the gathered order. All entries here are made up, except the last
 * block, which checks plain words after a name in the Core catalog.
 */

import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
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
const {namedLeadsOf, rootLeadsOf} = require('./_result.mjs');
/** @type {typeof import('./search.mjs')} */
const {search} = require('./search.mjs');

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
  it('for a name of two words written apart', () => {
    expect(leadsOf('glim tray with paging')).toEqual([]);
  });

  it('for a one-word name inside a longer ask', () => {
    expect(leadsOf('Glim board sorted rows paging example')).toEqual([]);
    expect(leadsOf('flux colors example board')).toEqual([]);
  });

  it('for a name the typed word only starts', () => {
    expect(leadsOf('GlimTraySortdRows with paging')).toEqual([]);
  });

  it('for a name inside a held display name', () => {
    // The display name is the block's own, so its spelled-out name leads.
    expect(leadsOf('GlimTray — Sorted rows example')).toEqual([
      'GlimTraySortedRows',
    ]);
    expect(leadsOf('GlimTray paging example')).toEqual(['GlimTray']);
  });

  it('for a name inside a held title, read as the title tier reads it', () => {
    expect(leadsOf('GlimTray — Sorted row example')).toEqual([
      'GlimTraySortedRows',
    ]);
    expect(leadsOf('how do I pick palette GlimTray colors')).toEqual([
      'GlimTray',
    ]);
    expect(leadsOf('GlimTray tray heading example')).toEqual([]);
  });

  it('for a name inside a longer named run', () => {
    expect(leadsOf('glimtray board example')).toEqual(['GlimTray']);
    expect(leadsOf('GlimTray sorted rows example')).toEqual([
      'GlimTraySortedRows',
    ]);
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

/** @type {Candidate} */
const Vexo = {
  domain: 'component',
  name: 'Vexo',
  keywords: ['vexo', 'panel', 'dock', 'stacked'],
  description: 'A vexo panel that docks, stacked or side by side.',
};
/** @type {Candidate} */
const VexoPanelDock = {
  domain: 'component',
  name: 'VexoPanelDock',
  keywords: ['dock'],
  description: 'Docks a vexo panel.',
};
/** @type {Candidate} */
const stackedBlock = {
  domain: 'template',
  name: 'VexoPanelDockStacked',
  keywords: ['VexoPanelDock'],
  description: 'Panels stacked in a dock.',
  prose: [],
  _kind: 'block',
};
const spelledAll = [Vexo, VexoPanelDock, stackedBlock];

/**
 * @param {string} query
 * @param {boolean} [view]
 */
const spelledLeadsOf = (query, view = true) => {
  const response = rankLexical(
    query,
    {},
    view ? searchView(catalog(spelledAll)) : catalog(spelledAll),
  );
  return [...(namedLeadsOf.get(response) ?? [])].map(
    r => /** @type {any} */ (r).name,
  );
};

describe('a name of three or more words spelled out apart', () => {
  it('leads, as written or with a typo the scorer reads', () => {
    for (const query of [
      'vexo panel dock stacked',
      'Vexo Panel Dock Stacked example',
      'vexo panel dock stakced',
      'vexo panels dock stacked',
    ]) {
      expect(spelledLeadsOf(query)).toEqual(['VexoPanelDockStacked']);
    }
  });

  it('leads only for the whole name, and the longest name wins', () => {
    expect(spelledLeadsOf('vexo panel dock')).toEqual(['VexoPanelDock']);
    expect(spelledLeadsOf('vexo panel stacked')).toEqual([]);
    expect(spelledLeadsOf('vexo panel dock zzzzzzz')).toEqual([
      'VexoPanelDock',
    ]);
  });

  it('leads nothing in the gathered reading, which build reads', () => {
    expect(spelledLeadsOf('vexo panel dock stacked', false)).toEqual([]);
  });

  it('goes first in its band, whatever the learned order says', () => {
    const query = 'vexo panel dock stakced';
    /** @type {Candidate} */
    const vexo = {
      domain: 'component',
      name: 'Vexo',
      keywords: ['vexo', 'panel'],
      description: 'A vexo panel.',
    };
    /** @param {Candidate} block */
    const order = block => {
      const entries = [vexo, VexoPanelDock, block];
      const lexical = rankLexical(
        query,
        {limit: Number.MAX_SAFE_INTEGER},
        searchView(catalog(entries)),
      );
      const table = entryTable(entries, {});
      return {
        lexical: lexical.data.results,
        ordered: orderMatches(table, [0, 1, 2], lexical, query, 10).data
          .results,
      };
    };
    // In the band of the components it names more fully, it goes first,
    // ahead of a match that outscores it, and keeps its own score.
    const near = order({
      ...stackedBlock,
      keywords: ['vexo', 'panel', 'dock', 'stacked'],
      description: 'Vexo panels stacked in a dock.',
    });
    // The learned order puts it last; the rest of the band keeps that order.
    expect(near.ordered.map(r => r.name)).toEqual([
      'VexoPanelDockStacked',
      'Vexo',
      'VexoPanelDock',
    ]);
    const lead = near.lexical.find(r => r.name === 'VexoPanelDockStacked');
    expect(near.ordered[0].score).toBe(lead?.score);
    const outscoring = near.ordered.find(r => r.name === 'VexoPanelDock');
    expect(outscoring?.score ?? 0).toBeGreaterThan(lead?.score ?? 0);
    // A match of a lower band stays below the band above it.
    const far = order({
      ...stackedBlock,
      keywords: ['VexoPanelDock', 'stacked panels'],
      description: 'Vexo panels stacked in a dock.',
    });
    expect(far.ordered.map(r => r.name).at(-1)).toBe('VexoPanelDockStacked');
  });
});

describe('a spelled-out name with a typo', () => {
  it('allows one word with a typo that keeps its first letter', () => {
    expect(spelledLeadsOf('vexo panle dock stacked')).toEqual([
      'VexoPanelDockStacked',
    ]);
    // Two words with typos spell out no name.
    expect(spelledLeadsOf('vexo panle dokc stacked')).toEqual([]);
    // A typo that changes the first letter spells out only the shorter name.
    expect(spelledLeadsOf('vexo panel dock ztacked')).toEqual([
      'VexoPanelDock',
    ]);
  });

  it('never reads a plain word as a name word', () => {
    expect(spelledLeadsOf('vexo panel with stacked')).toEqual([]);
    expect(spelledLeadsOf('vexo panel dock with')).toEqual(['VexoPanelDock']);
  });
});

describe("a spelled-out part of a family and the family's root", () => {
  /** @type {Candidate[]} */
  const family = [
    {
      domain: 'component',
      name: 'BrindleKnob',
      keywords: ['brindle', 'knob'],
      description: 'A brindle knob.',
    },
    {
      domain: 'component',
      name: 'BrindleKnobGroup',
      _family: 'BrindleKnob',
      keywords: ['group'],
      description: 'Groups brindle knobs.',
    },
  ];

  it('keeps the part first, with no root lead', () => {
    const query = 'brindle knob gropu';
    const lexical = rankLexical(
      query,
      {limit: Number.MAX_SAFE_INTEGER},
      searchView(catalog(family)),
    );
    expect(
      [...(namedLeadsOf.get(lexical) ?? [])].map(
        r => /** @type {any} */ (r).name,
      ),
    ).toEqual(['BrindleKnobGroup']);
    expect(rootLeadsOf.get(lexical)?.size ?? 0).toBe(0);
    const table = entryTable(family, {});
    const ordered = orderMatches(table, [0, 1], lexical, query, 10).data
      .results;
    expect(ordered[0].name).toBe('BrindleKnobGroup');
  });
});

describe('plain words after a name in the Core catalog', () => {
  const cwd = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../..',
  );

  it('keep the component the query names first', async () => {
    const avatar = await search('avatar status with icons', {cwd});
    expect(avatar.data.results[0].name).toBe('Avatar');
    const chat = await search('chat message list with icons', {cwd});
    expect(chat.data.results.slice(0, 3).map(r => r.name)).toContain(
      'ChatMessage',
    );
  }, 60_000);
});
