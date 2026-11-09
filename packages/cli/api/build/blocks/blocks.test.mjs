// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Unit tests for build's block picker on small hand-written weights: it
 * lists as many blocks as build's own, from the block catalog, each once; a
 * block search did not return gets the picker's own entry with a real score
 * and reason; a block the request writes out by its exact name keeps its slot,
 * as does a block an integration ships; a block the weights were never fitted
 * with is still ranked from its own docs; and ties keep build's order.
 */

import {describe, expect, it} from 'vitest';
import {pickBlocks, stemOf, termsOf, wordsOf} from './blocks.mjs';

/** Two dims, each byte a weight offset by 128: "chart" words on the first, "table" words on the second. */
const MATRIX = 'goCBgICCgIGAgICAgoA=';

/** @type {import('./blocks.mjs').BlockPickerWeights} */
const WEIGHTS = {
  vocab: ['chart', 'sale', 'table', 'row', 'toggle', 'switch', 'sale_chart'],
  idf: [1024, 1024, 1024, 1024, 2048, 2048, 1024],
  dims: 2,
  request: MATRIX,
  requestScale: 1,
  doc: MATRIX,
  docScale: 1,
  lexical: 2,
  known: ['ChartBar', 'TableBasic', 'CardStat', 'ListPlain'],
  theta: {
    g: 1,
    grank: 0,
    gmargin: 0,
    seen: 0,
    lex: 1,
    sscore: 0,
    scov: 0,
    srank: 0,
    inkit: 0,
    kitpos: 0,
    mention: 0,
    show: 0,
  },
};

/** @type {import('./blocks.mjs').CatalogBlock[]} */
const CATALOG = [
  {
    name: 'ChartBar',
    package: '@astryxdesign/core',
    displayName: 'Chart — Bar',
    description: 'A bar chart of sales by month.',
    command: 'astryx template ChartBar --type block',
  },
  {
    name: 'TableBasic',
    package: '@astryxdesign/core',
    displayName: 'Table — Basic',
    description: 'A table of rows.',
    command: 'astryx template TableBasic --type block',
  },
  {
    name: 'CardStat',
    package: '@astryxdesign/core',
    displayName: 'Card — Stat',
    description: 'A card with one number.',
    command: 'astryx template CardStat --type block',
  },
  {
    name: 'ListPlain',
    package: '@astryxdesign/core',
    displayName: 'List — Plain',
    description: 'A plain list.',
    command: 'astryx template ListPlain --type block',
  },
  {
    name: 'SwitchToggle',
    package: '@astryxdesign/core',
    displayName: 'Switch — Toggle',
    description: 'A toggle switch.',
    command: 'astryx template SwitchToggle --type block',
  },
];

/** @type {import('./blocks.mjs').CatalogComponent[]} */
const COMPONENTS = [
  {name: 'Chart', keywords: ['graph']},
  {name: 'Table', keywords: ['grid']},
  {name: 'Card'},
  {name: 'List'},
  {name: 'Switch', keywords: ['toggle']},
];

/** @type {[string, number, number, number][]} */
const SEARCHED = [
  ['TableBasic', 96, 1, 3],
  ['ListPlain', 64, 1, 3],
  ['CardStat', 40, 1, 3],
];

/**
 * @param {string[]} kitBlocks
 * @param {string[]} [foreign]
 */
const signals = (kitBlocks, foreign = []) => ({
  kitBlocks,
  searched: SEARCHED,
  foreign,
  catalog: CATALOG,
  components: COMPONENTS,
});

describe('pickBlocks', () => {
  it('lists as many blocks as build’s own, from the catalog, each once', () => {
    const own = ['TableBasic', 'ListPlain', 'CardStat'];
    const {names} = pickBlocks('sales chart', signals(own), WEIGHTS);
    expect(names).toHaveLength(own.length);
    expect(new Set(names).size).toBe(names.length);
    for (const b of names) expect(CATALOG.some(c => c.name === b)).toBe(true);
  });

  it('puts the block that means what the request asks first, even one search did not return', () => {
    const own = ['TableBasic', 'ListPlain'];
    const {names, entries} = pickBlocks('sales chart', signals(own), WEIGHTS);
    expect(names[0]).toBe('ChartBar');
    const entry = entries.get('ChartBar');
    expect(entry?.score).toBeGreaterThan(0);
    expect(entry?.reason).toMatch(/chart|sales/);
    expect(entry?.description).toBe('A bar chart of sales by month.');
    // Blocks search returned keep search's entry: the picker adds none.
    for (const b of names)
      if (SEARCHED.some(s => s[0] === b)) expect(entries.has(b)).toBe(false);
  });

  it('keeps a block the request writes out by its exact name in its slot', () => {
    const own = ['ListPlain', 'TableBasic'];
    const {names} = pickBlocks(
      'sales chart beside a ListPlain',
      signals(own),
      WEIGHTS,
    );
    expect(names[0]).toBe('ListPlain');
  });

  it('keeps a block with a long name in its slot when the request writes it out', () => {
    const long = {
      name: 'ListPlainWithSixWordName',
      package: '@astryxdesign/core',
      displayName: 'List — Plain with a long name',
      description: 'A plain list.',
      command: 'astryx template ListPlainWithSixWordName --type block',
    };
    const s = {
      ...signals(['ListPlainWithSixWordName', 'TableBasic']),
      catalog: [...CATALOG, long],
    };
    const {names} = pickBlocks(
      'sales chart starting from ListPlainWithSixWordName',
      s,
      WEIGHTS,
    );
    expect(names[0]).toBe('ListPlainWithSixWordName');
  });

  it('does not pin a block for its component’s word alone', () => {
    const own = ['ListPlain', 'TableBasic'];
    const {names} = pickBlocks('sales chart list', signals(own), WEIGHTS);
    expect(names[0]).toBe('ChartBar');
  });

  it('keeps a block an integration ships in its slot', () => {
    const own = ['ListPlain', 'TableBasic'];
    const {names} = pickBlocks(
      'sales chart',
      signals(own, ['ListPlain']),
      WEIGHTS,
    );
    expect(names[0]).toBe('ListPlain');
  });

  it('ranks a block the weights were never fitted with from its own docs', () => {
    expect(WEIGHTS.known).not.toContain('SwitchToggle');
    const own = ['TableBasic', 'ListPlain'];
    const {names, entries} = pickBlocks('toggle switch', signals(own), WEIGHTS);
    expect(names[0]).toBe('SwitchToggle');
    expect(entries.get('SwitchToggle')?.reason).toMatch(/toggle|switch/);
  });

  it('keeps build’s order when nothing in the request is known', () => {
    const own = ['ListPlain', 'TableBasic', 'CardStat'];
    const {names} = pickBlocks('zzz qqq', signals(own), WEIGHTS);
    expect(names).toEqual(own);
  });

  it('returns nothing when build names no block, and does not change its input', () => {
    const s = signals([]);
    const before = JSON.stringify(s);
    expect(pickBlocks('sales chart', s, WEIGHTS)).toEqual({
      names: [],
      entries: new Map(),
    });
    const own = ['TableBasic', 'ListPlain'];
    const s2 = signals(own);
    const before2 = JSON.stringify(s2);
    pickBlocks('sales chart', s2, WEIGHTS);
    expect(JSON.stringify(s)).toBe(before);
    expect(JSON.stringify(s2)).toBe(before2);
  });
});

describe('the picker’s words', () => {
  it('stems plurals and verb endings of longer words only', () => {
    expect(stemOf('tables')).toBe('table');
    expect(stemOf('classes')).toBe('class');
    expect(stemOf('entries')).toBe('entry');
    expect(stemOf('class')).toBe('class');
    expect(stemOf('rows')).toBe('rows');
  });

  it('splits identifiers into words', () => {
    expect(wordsOf('SideNavNestedItems')).toEqual([
      'side',
      'nav',
      'nested',
      'items',
    ]);
    expect(wordsOf('KPICard')).toEqual(['kpi', 'card']);
  });

  it('reads content words and their adjacent pairs, never a function word', () => {
    expect(termsOf('the sales charts for a team')).toEqual([
      'sale',
      'chart',
      'team',
      'sale_chart',
      'chart_team',
    ]);
  });
});
