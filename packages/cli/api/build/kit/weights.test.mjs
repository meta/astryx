// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';

import {isWeightsFile} from '../_adapter.mjs';
import {SHELL, stem, weighStart, weightWords} from './weights.mjs';

// A made-up table for tests only: three page templates and the app shell.
const CANDIDATES = [SHELL, 'board', 'charts', 'grid'];

/**
 * @param {Record<string, number[]>} weights per word, one value per candidate
 * @param {number[]} [bias]
 * @param {number} [step]
 * @param {number} [clip]
 */
function table(weights, bias = [0, 0, 0, 0], step = 0.5, clip = 4) {
  return {
    words: Object.keys(weights),
    bias,
    clip,
    step,
    rows: Object.values(weights).map(ws =>
      ws
        .map(w => String.fromCharCode(97 + Math.round((w + clip) / step)))
        .join(''),
    ),
  };
}

const WEIGHTS = {
  version: 1,
  candidates: CANDIDATES,
  tables: [
    table({
      [stem('kanban')]: [0, 3, 0, 0],
      [stem('existing')]: [3, 0, 0, 0],
      [stem('charts')]: [0, 0, 2, 0],
    }),
    table({[stem('cards')]: [0, 0, 0, 1]}, [0, 0, 0, 0], 1, 4),
  ],
  // three numbers per member (table 1, the ranker, table 2), then one for SHELL
  blend: [1, 0, 0, 0.5, 0, 0, 0.2, 0, 0, 0],
};
const CATALOG = [
  {name: 'board'},
  {name: 'charts'},
  {name: 'grid'},
  {name: 'top-nav'},
];

/**
 * @param {string} name
 * @param {number} score
 * @param {string} family
 */
const page = (name, score, family) => ({
  name,
  score,
  hits: 1,
  family,
  base: true,
  familyNamed: false,
  containerMatched: false,
  matched: new Set(),
});
/** A ranker output that prefers `charts`. */
const RANKED = [
  page('charts', 3, 'Charts'),
  page('grid', 1, 'Grid'),
  page('board', 0.5, 'Board'),
  page('top-nav', 0, 'Shell'),
];

describe('weighStart', () => {
  it('lets the word weights outvote the ranker', () => {
    const start = weighStart(
      'a kanban for launches',
      RANKED,
      RANKED[0],
      CATALOG,
      {
        weights: WEIGHTS,
      },
    );
    expect(start).toBe('board');
  });

  it('keeps the ranker when the words carry no weight', () => {
    const start = weighStart('something else', RANKED, RANKED[0], CATALOG, {
      weights: WEIGHTS,
    });
    expect(start).toBe('charts');
  });

  it('returns null for the app shell', () => {
    const start = weighStart('tweak the existing page', RANKED, null, CATALOG, {
      weights: WEIGHTS,
    });
    expect(start).toBeNull();
  });

  it('returns undefined without weights, so the ranker decides', () => {
    const start = weighStart('a kanban', RANKED, RANKED[0], CATALOG, {
      weights: null,
    });
    expect(start).toBeUndefined();
  });

  it('never starts from a template the project does not have', () => {
    const catalog = CATALOG.filter(t => t.name !== 'board');
    const ranked = RANKED.filter(r => r.name !== 'board');
    const start = weighStart('a kanban', ranked, ranked[0], catalog, {
      weights: WEIGHTS,
    });
    expect(start).not.toBe('board');
  });

  it("keeps the ranker's pick of a template the tables do not list", () => {
    const catalog = [...CATALOG, {name: 'fresh'}];
    const ranked = [page('fresh', 9, 'Fresh'), ...RANKED];
    const start = weighStart('a kanban', ranked, ranked[0], catalog, {
      weights: WEIGHTS,
    });
    expect(start).toBe('fresh');
  });

  describe('a template the tables do not list (cold start)', () => {
    // A made-up family the tables have never seen, described only by its own
    // descriptor, next to listed templates with descriptors of their own.
    const catalog = [
      {name: 'board', displayName: 'Kanban Board', keywords: ['kanban']},
      {name: 'charts', displayName: 'Charts', category: 'Charts - Overview'},
      {name: 'grid', displayName: 'Grid'},
      {
        name: 'gauge-fleet',
        displayName: 'Fleet Gauges',
        category: 'Gauges - Fleet',
        keywords: ['gauges', 'fleet', 'meters'],
      },
    ];

    it('starts from it when the idea names its own words', () => {
      const ranked = [page('gauge-fleet', 9, 'Gauges'), ...RANKED];
      const start = weighStart(
        'fleet gauges with meters per kanban lane',
        ranked,
        ranked[0],
        catalog,
        {weights: WEIGHTS},
      );
      expect(start).toBe('gauge-fleet');
    });

    it('starts from it when the idea names its family first', () => {
      const ranked = [page('gauge-fleet', 9, 'Gauges'), ...RANKED];
      const start = weighStart(
        'gauges page with a kanban board',
        ranked,
        ranked[0],
        catalog,
        {weights: WEIGHTS},
      );
      expect(start).toBe('gauge-fleet');
    });

    it("never counts a stopword from another template's keywords", () => {
      // "side" in grid's "side by side" keyword is one of search's stopwords;
      // it must not answer the idea's "sides", which is not.
      const own = [
        {name: 'board'},
        {name: 'charts'},
        {
          name: 'grid',
          displayName: 'Grid',
          keywords: ['side by side', 'orders'],
        },
        {name: 'fold', displayName: 'Folding Rows'},
      ];
      const ranked = [page('fold', 9, 'Fold'), ...RANKED];
      const start = weighStart(
        'rows on two sides with orders on cards',
        ranked,
        ranked[0],
        own,
        {weights: WEIGHTS},
      );
      expect(start).toBe('fold');
    });

    it("never counts a stopword from the idea's words", () => {
      // "basically" is one of search's stopwords and stems to "basic", the
      // word of grid's category; it must not tip the count to grid.
      const own = [
        {name: 'board'},
        {name: 'charts'},
        {name: 'grid', displayName: 'Grid', category: 'Grid - Basic'},
        {name: 'fold', displayName: 'Folding Rows'},
      ];
      const ranked = [page('fold', 9, 'Fold'), ...RANKED];
      const start = weighStart(
        'basically a grid of rows on cards',
        ranked,
        ranked[0],
        own,
        {weights: WEIGHTS},
      );
      expect(start).toBe('fold');
    });

    it('yields to the listed template whose own words the idea names more', () => {
      const ranked = [page('gauge-fleet', 9, 'Gauges'), ...RANKED];
      const start = weighStart(
        'a kanban board with a fleet column',
        ranked,
        ranked[0],
        catalog,
        {weights: WEIGHTS},
      );
      expect(start).toBe('board');
    });
  });

  it("keeps the ranker's template for an idea that asks for a new page", () => {
    const start = weighStart('the existing page', RANKED, RANKED[0], CATALOG, {
      weights: WEIGHTS,
      newPage: true,
    });
    expect(start).toBe('charts');
  });

  it('starts a new page from the shell when the ranker has no template', () => {
    const start = weighStart('the existing page', RANKED, null, CATALOG, {
      weights: WEIGHTS,
      newPage: true,
    });
    expect(start).toBeNull();
  });

  it('keeps a template the ranker placed by its frame', () => {
    const framed = {...RANKED[1], containerMatched: true};
    for (const idea of ['the existing page', 'a kanban']) {
      const start = weighStart(idea, RANKED, framed, CATALOG, {
        weights: WEIGHTS,
      });
      expect(start).toBe('grid');
    }
  });

  it('is deterministic', () => {
    const run = () =>
      weighStart('kanban charts cards', RANKED, RANKED[0], CATALOG, {
        weights: WEIGHTS,
      });
    expect(run()).toBe(run());
  });
});

describe('weightWords', () => {
  it('keeps letter words of two or more characters', () => {
    expect(weightWords('A 3-col Dashboard, v2 KPIs!')).toEqual([
      'col',
      'dashboard',
      'kpis',
    ]);
  });
});

describe('isWeightsFile', () => {
  it('accepts a well-formed file', () => {
    expect(isWeightsFile(WEIGHTS)).toBe(true);
  });

  it('rejects a file whose rows, bias or blend do not fit the candidates', () => {
    const [first, second] = WEIGHTS.tables;
    expect(isWeightsFile({...WEIGHTS, blend: [1, 2, 3]})).toBe(false);
    expect(
      isWeightsFile({...WEIGHTS, tables: [{...first, rows: ['ab']}, second]}),
    ).toBe(false);
    expect(
      isWeightsFile({...WEIGHTS, tables: [{...first, bias: [0]}, second]}),
    ).toBe(false);
    expect(isWeightsFile({version: 1})).toBe(false);
    expect(isWeightsFile(null)).toBe(false);
  });
});
