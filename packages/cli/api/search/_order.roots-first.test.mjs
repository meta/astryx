// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A family's root leads a part of its own family when the part adds
 * nothing the query asked for. The lexical ranker names the root of each
 * part it leads (rootLeadsOf), and the order of matches puts that root just
 * ahead of the part, in the part's run, whatever their scores (rootsFirst in
 * _order.mjs). Made-up entries: the Zorb family (root ZorbList; parts Zorb,
 * ZorbItem and ZorbStatus), the Quill family (root QuillBox, part QuillMark)
 * and the Glimmerstone family (root Glimmerstone, part GlimmerstoneTab).
 */

import {describe, expect, it} from 'vitest';
import {requireNatively} from '../../test-utils/native-require.mjs';

const require = requireNatively(import.meta.url);
/** @type {typeof import('./_order.mjs')} */
const {orderMatches, rootsFirst} = require('./_order.mjs');
/** @type {typeof import('./_lexical.mjs')} */
const {rankLexical} = require('./_lexical.mjs');
/** @type {typeof import('./_named-keywords.mjs')} */
const {searchView} = require('./_named-keywords.mjs');
/** @type {typeof import('./_entries.mjs')} */
const {entryTable} = require('./_entries.mjs');
/** @type {typeof import('./_result.mjs')} */
const {rootLeadsOf, weakRootsOf} = require('./_result.mjs');

/** @typedef {import('./_lexical.mjs').Candidate} Candidate */

/** @type {Candidate[]} */
const all = [
  {
    domain: 'component',
    name: 'ZorbList',
    keywords: ['zorbs', 'pile', 'stack'],
    description: 'Lays out zorb cards in a tidy pile of ZorbItem rows.',
  },
  {
    domain: 'component',
    name: 'Zorb',
    _family: 'ZorbList',
    keywords: ['card'],
    description: 'One zorb card.',
  },
  {
    domain: 'component',
    name: 'ZorbItem',
    _family: 'ZorbList',
    keywords: ['row'],
    description: 'A zorb row inside a list.',
  },
  {
    domain: 'component',
    name: 'ZorbStatus',
    _family: 'ZorbList',
    keywords: ['statuses'],
    description: 'A zorb status dot.',
  },
  {
    domain: 'component',
    name: 'QuillBox',
    keywords: ['frame'],
    description: 'A quill frame.',
  },
  {
    domain: 'component',
    name: 'QuillMark',
    _family: 'QuillBox',
    keywords: ['ink'],
    description: 'A quill ink mark.',
  },
  {
    domain: 'component',
    name: 'Glimmerstone',
    keywords: ['gem'],
    description: 'A gem.',
  },
  {
    domain: 'component',
    name: 'GlimmerstoneTab',
    _family: 'Glimmerstone',
    keywords: ['tab'],
    description: 'A gem tab.',
  },
  {domain: 'component', name: 'Fizz', keywords: ['pile'], description: 'Fizz.'},
];

/** @param {string} query */
const lexicalOf = query =>
  rankLexical(
    query,
    {limit: Number.MAX_SAFE_INTEGER},
    searchView({all, components: all, searchedComponents: false}),
  );

/**
 * Each part the lexical ranker puts its root ahead of, as `Part<Root`.
 * @param {string} query
 */
const leadsOf = query =>
  [...(rootLeadsOf.get(lexicalOf(query)) ?? [])].map(
    ([part, root]) =>
      `${/** @type {any} */ (part).name}<${/** @type {any} */ (root).name}`,
  );

/**
 * The searched order, with the learned order putting the parts first.
 * @param {string} query
 */
const ordered = query => {
  const families = new Map(
    all.flatMap(c => (c._family ? [[`${c.domain}:${c.name}`, c._family]] : [])),
  );
  const learned = all
    .map((c, i) => [c, i])
    .sort(([a], [b]) => Number(!!b._family) - Number(!!a._family))
    .map(([, i]) => /** @type {number} */ (i));
  return orderMatches(
    entryTable(all, {}),
    learned,
    lexicalOf(query),
    query,
    10,
    families,
  ).data.results.map(r => r.name);
};

describe('which roots lead their parts (rankLexical)', () => {
  it('a root that answers every word its part answers', () => {
    expect(leadsOf('zorb glow')).toEqual(
      expect.arrayContaining(['Zorb<ZorbList', 'ZorbItem<ZorbList']),
    );
    expect(leadsOf('zorbs')).toContain('Zorb<ZorbList');
  });

  it('no root when the part answers a word the root does not', () => {
    expect(leadsOf('quill ink frame')).toEqual([]);
  });

  it('no root when the query holds a word only the part name has', () => {
    expect(leadsOf('zorb item glow')).not.toContain('ZorbItem<ZorbList');
    expect(leadsOf('ZorbItem glow')).toEqual([]);
    // In any plural or stem form, as search reads words.
    expect(leadsOf('zorb statuses')).not.toContain('ZorbStatus<ZorbList');
  });

  it('no root when one typed word is the part name of two or more words', () => {
    expect(leadsOf('zorbitem glow')).toEqual([]);
    // Misspelled as the scorer reads a misspelled name.
    expect(leadsOf('glimmerstonetb')).toEqual([]);
    // The root's own name typed is no misspelled part.
    expect(leadsOf('glimmerstone gem')).toEqual([
      'GlimmerstoneTab<Glimmerstone',
    ]);
  });
});

describe("which roots lead their parts, by the root's own evidence", () => {
  /** @type {Candidate[]} */
  const more = [
    {
      domain: 'component',
      name: 'Plinth',
      keywords: ['base'],
      description: 'A base that can glide.',
    },
    {
      domain: 'component',
      name: 'PlinthWarden',
      _family: 'Plinth',
      keywords: ['glide'],
      description: 'Keeps a plinth in step.',
    },
    {
      domain: 'component',
      name: 'Plume',
      keywords: ['feather'],
      description: 'A plume.',
    },
    {
      domain: 'component',
      name: 'VPlume',
      _family: 'Plume',
      keywords: ['column'],
      description: 'A vertical plume.',
    },
  ];
  /** @param {string} query */
  const marksOf = query =>
    [
      ...(rootLeadsOf.get(
        rankLexical(
          query,
          {limit: Number.MAX_SAFE_INTEGER},
          searchView({all: more, components: more, searchedComponents: false}),
        ),
      ) ?? []),
    ].map(
      ([part, root]) =>
        `${/** @type {any} */ (part).name}<${/** @type {any} */ (root).name}`,
    );

  it('a root that answers only in its text leads only inside the run', () => {
    const lexical = rankLexical(
      'glide',
      {limit: Number.MAX_SAFE_INTEGER},
      searchView({all: more, components: more, searchedComponents: false}),
    );
    const weak = [...(weakRootsOf.get(lexical) ?? [])].map(
      r => /** @type {any} */ (r).name,
    );
    expect(weak).toEqual(['PlinthWarden']);
    const order = orderMatches(
      entryTable(more, {}),
      more.map((_, i) => i),
      lexical,
      'glide',
      10,
    ).data.results.map(r => r.name);
    expect(order.indexOf('PlinthWarden')).toBeLessThan(order.indexOf('Plinth'));
  });

  it("a typed word that is the root's own name is no misspelled part", () => {
    expect(marksOf('plume feather')).toContain('VPlume<Plume');
  });
});

describe('the order of matches', () => {
  it('puts the root just ahead of its part across score bands', () => {
    const lexical = lexicalOf('zorb glow').data.results;
    const part = lexical.find(r => r.name === 'Zorb');
    const root = lexical.find(r => r.name === 'ZorbList');
    expect(part?.score).toBeGreaterThanOrEqual(100);
    expect(root?.score).toBeLessThan(100);
    expect(ordered('zorb glow').slice(0, 2)).toEqual(['ZorbList', 'Zorb']);
  });

  it('keeps the part first when the root does not lead it', () => {
    expect(ordered('quill ink')).toEqual(['QuillMark', 'QuillBox']);
  });
});

describe("a root and its part's tie", () => {
  /** @type {Candidate[]} */
  const tied = [
    all[0],
    all[1],
    {
      domain: 'component',
      name: 'Fizz',
      keywords: ['spark'],
      description: 'A fizz spark.',
    },
    {domain: 'component', name: 'Lamp', description: 'A lamp with fizz.'},
    {domain: 'component', name: 'Ember', description: 'An ember fizz.'},
    {
      domain: 'template',
      name: 'ZorbFizzBoard',
      keywords: ['zorb', 'fizz', 'board'],
      description: 'A board of zorb fizz.',
      _kind: 'page',
      prose: [],
    },
    {
      domain: 'template',
      name: 'ZorbCardBasic',
      keywords: ['sample'],
      description: 'A sample.',
      _kind: 'block',
      prose: [],
    },
    {
      domain: 'template',
      name: 'ZorbListTall',
      keywords: ['sample'],
      description: 'A sample.',
      _kind: 'block',
      prose: [],
    },
  ];
  /** @param {string} query */
  const orderedIn = query => {
    const lexical = rankLexical(
      query,
      {limit: Number.MAX_SAFE_INTEGER},
      searchView({
        all: tied,
        components: tied.filter(c => c.domain === 'component'),
        searchedComponents: false,
      }),
    );
    return {
      lexical: lexical.data.results.map(r => [r.name, r.score]),
      order: orderMatches(
        entryTable(tied, {}),
        tied.map((_, i) => i),
        lexical,
        query,
        10,
        new Map([['component:Zorb', 'ZorbList']]),
      ).data.results.map(r => r.name),
    };
  };

  it('lets nothing pass the part when the part ties with another match', () => {
    const {lexical, order} = orderedIn('zorb fizz');
    // Zorb ties with Fizz, ahead of it in name order.
    expect(lexical.slice(1, 3)).toEqual([
      ['Fizz', 108],
      ['Zorb', 108],
    ]);
    expect(order.slice(0, 4)).toEqual([
      'ZorbFizzBoard',
      'ZorbList',
      'Zorb',
      'Fizz',
    ]);
  });

  it("orders the tie below by the root's parts when the root leads", () => {
    const {lexical, order} = orderedIn('zorb sample');
    expect(lexical[0][0]).toBe('Zorb');
    expect(order.slice(0, 4)).toEqual([
      'ZorbList',
      'Zorb',
      'ZorbListTall',
      'ZorbCardBasic',
    ]);
  });
});

/**
 * @param {[string, number][]} rows name and run
 */
const items = rows =>
  rows.map(([name, band], i) => ({
    res: {domain: 'component', name},
    i,
    band,
    learned: i,
  }));

/** @param {any[]} out */
const names = out => out.map(it => it.res.name);

describe('rootsFirst', () => {
  it('moves the root directly before its part in their run', () => {
    const rows = items([
      ['Fizz', 0],
      ['Zorb', 0],
      ['Glim', 0],
      ['ZorbList', 0],
    ]);
    const roots = new Map([[rows[1].res, rows[3].res]]);
    expect(names(rootsFirst(rows, roots))).toEqual([
      'Fizz',
      'ZorbList',
      'Zorb',
      'Glim',
    ]);
  });

  it('moves the root directly before its part from another run', () => {
    const rows = items([
      ['Fizz', 0],
      ['Zorb', 0],
      ['Glim', 1],
      ['ZorbList', 2],
    ]);
    const roots = new Map([[rows[1].res, rows[3].res]]);
    expect(names(rootsFirst(rows, roots))).toEqual([
      'Fizz',
      'ZorbList',
      'Zorb',
      'Glim',
    ]);
  });

  it('names only the parts whose root it moved', () => {
    const rows = items([
      ['QuillBox', 0],
      ['QuillMark', 0],
      ['Zorb', 0],
      ['ZorbList', 1],
    ]);
    const roots = new Map([
      [rows[1].res, rows[0].res],
      [rows[2].res, rows[3].res],
    ]);
    /** @type {Map<object, object>} */
    const moved = new Map();
    rootsFirst(rows, roots, moved);
    expect([...moved].map(([part, root]) => [part.name, root.name])).toEqual([
      ['Zorb', 'ZorbList'],
    ]);
  });

  it("moves a weakly marked root only inside its part's run", () => {
    const rows = items([
      ['Zorb', 0],
      ['Fizz', 0],
      ['ZorbList', 1],
    ]);
    const roots = new Map([[rows[0].res, rows[2].res]]);
    expect(
      names(rootsFirst(rows, roots, undefined, new Set([rows[0].res]))),
    ).toEqual(['Zorb', 'Fizz', 'ZorbList']);
    const same = items([
      ['Zorb', 0],
      ['Fizz', 0],
      ['ZorbList', 0],
    ]);
    const inRun = new Map([[same[0].res, same[2].res]]);
    expect(
      names(rootsFirst(same, inRun, undefined, new Set([same[0].res]))),
    ).toEqual(['ZorbList', 'Zorb', 'Fizz']);
  });

  it('leaves a root already ahead of its part in place', () => {
    const rows = items([
      ['ZorbList', 0],
      ['Fizz', 0],
      ['Zorb', 0],
    ]);
    const roots = new Map([[rows[2].res, rows[0].res]]);
    expect(names(rootsFirst(rows, roots))).toEqual([
      'ZorbList',
      'Fizz',
      'Zorb',
    ]);
  });
});
