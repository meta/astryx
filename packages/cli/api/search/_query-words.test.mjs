// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How search's classifier reads a query: its words, plural-folded
 * forms, name words, word pairs, the router's tokens and shape flags, and
 * the class probabilities built from them.
 */

import * as fs from 'node:fs';
import {describe, expect, it} from 'vitest';
import {SEARCH_DOMAINS} from './_query.mjs';
import {
  DOMAINS,
  ROUTES,
  fold,
  nameWords,
  queryTokens,
  queryWords,
  routeProbs,
  routerTokens,
  words,
} from './_query-words.mjs';

describe('DOMAINS and ROUTES', () => {
  it('index the domains search covers, then a class for none of them', () => {
    expect(DOMAINS).toEqual(SEARCH_DOMAINS);
    expect(ROUTES).toEqual([...DOMAINS, 'NONE']);
  });

  it('match the classes the shipped router weights are indexed by', () => {
    const weights = JSON.parse(
      fs.readFileSync(new URL('./tree.weights.json', import.meta.url), 'utf8'),
    );
    expect(weights.classes).toEqual(ROUTES);
  });
});

describe('words', () => {
  it('lowercases and splits on anything but letters and digits', () => {
    expect(words('Hello, World_9!')).toEqual(['hello', 'world', '9']);
  });

  it('gives no words for empty or missing text', () => {
    expect(words('')).toEqual([]);
    expect(words(undefined)).toEqual([]);
    expect(words('***')).toEqual([]);
  });
});

describe('fold', () => {
  it('folds a plural to its singular', () => {
    expect(fold('tests')).toBe('test');
    expect(fold('icons')).toBe('icon');
    expect(fold('categories')).toBe('category');
  });

  it('folds es after s, x, or z', () => {
    expect(fold('boxes')).toBe('box');
    expect(fold('classes')).toBe('class');
    expect(fold('buses')).toBe('bus');
  });

  it('leaves a word ending in ss alone', () => {
    expect(fold('class')).toBe('class');
    expect(fold('glass')).toBe('glass');
  });

  it('leaves a short word alone', () => {
    expect(fold('is')).toBe('is');
    expect(fold('go')).toBe('go');
    expect(fold('as')).toBe('as');
  });

  it('leaves a singular alone', () => {
    expect(fold('table')).toBe('table');
    expect(fold('button')).toBe('button');
  });
});

describe('nameWords', () => {
  it('splits a PascalCase name into its words', () => {
    expect(nameWords('DateRangeInput')).toEqual(['date', 'range', 'input']);
  });

  it('keeps an acronym together until the next word starts', () => {
    expect(nameWords('XMLHttpRequest')).toEqual(['xml', 'http', 'request']);
  });

  it('splits a camelCase hook name', () => {
    expect(nameWords('useDebouncedValue')).toEqual([
      'use',
      'debounced',
      'value',
    ]);
  });

  it('splits on dashes and slashes', () => {
    expect(nameWords('foo-bar/baz')).toEqual(['foo', 'bar', 'baz']);
  });

  it('keeps a digit with the word before it', () => {
    expect(nameWords('Button2')).toEqual(['button2']);
  });

  it('gives no words for an empty name', () => {
    expect(nameWords('')).toEqual([]);
  });
});

describe('queryWords', () => {
  it('drops filler words and folds plurals', () => {
    expect(queryWords('show me the data tables')).toEqual(['data', 'table']);
  });

  it('drops question words and "use"', () => {
    expect(queryWords('How to use the Button')).toEqual(['button']);
  });

  it('gives no words for a query of filler', () => {
    expect(queryWords('the of a')).toEqual([]);
  });
});

describe('queryTokens', () => {
  it('gives the words, then each adjacent pair joined by an underscore', () => {
    expect(queryTokens('date range picker')).toEqual([
      'date',
      'range',
      'picker',
      'date_range',
      'range_picker',
    ]);
  });

  it('gives no pair for a one-word query', () => {
    expect(queryTokens('table')).toEqual(['table']);
  });

  it('lists a repeated token once', () => {
    expect(queryTokens('table table')).toEqual(['table', 'table_table']);
    expect(new Set(queryTokens('a1 a1 a1')).size).toBe(
      queryTokens('a1 a1 a1').length,
    );
  });

  it('pairs the words that stay after filler is dropped', () => {
    expect(queryTokens('date and range')).toEqual([
      'date',
      'range',
      'date_range',
    ]);
  });

  it('gives nothing for a query of filler', () => {
    expect(queryTokens('the of')).toEqual([]);
  });
});

describe('routerTokens', () => {
  it('starts with the query tokens and ends with the bias', () => {
    const tokens = routerTokens('date range');
    expect(tokens.slice(0, 3)).toEqual(['date', 'range', 'date_range']);
    expect(tokens.at(-1)).toBe('#bias');
  });

  it('flags the number of words, filler included, up to six', () => {
    expect(routerTokens('table')).toContain('#n1');
    expect(routerTokens('the data table')).toContain('#n3');
    expect(routerTokens('a b c d e f g h i')).toContain('#n6');
    expect(routerTokens('a b c d e f g h i')).not.toContain('#n9');
  });

  it('flags a query that opens with a question word', () => {
    expect(routerTokens('how do tabs work')).toContain('#question');
    expect(routerTokens('what is a hook')).toContain('#question');
    expect(routerTokens('tabs how do they work')).not.toContain('#question');
  });

  it('flags a hook name', () => {
    expect(routerTokens('useState hook')).toContain('#usehook');
    expect(routerTokens('table')).not.toContain('#usehook');
  });

  it('flags a camelCase or PascalCase name', () => {
    expect(routerTokens('DateRangeInput')).toContain('#camel');
    expect(routerTokens('table')).not.toContain('#camel');
    expect(routerTokens('Button')).not.toContain('#camel');
  });

  it('gives only the count and the bias for a plain one-word query', () => {
    expect(routerTokens('table')).toEqual(['table', '#n1', '#bias']);
  });
});

describe('routeProbs', () => {
  /** @type {import('../../foundation/route/route.mjs').ClassifierWeights} */
  const weights = {
    classes: ROUTES,
    tokens: {
      table: [3, 0, 0, 0, 0, 0],
      hook: [0, 3, 0, 0, 0, 0],
    },
  };

  it('gives one probability per class, adding up to one', () => {
    const p = routeProbs(weights, 'table');
    expect(p).toHaveLength(ROUTES.length);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it('favors the class a known token weighs toward', () => {
    const p = routeProbs(weights, 'table');
    expect(p.indexOf(Math.max(...p))).toBe(ROUTES.indexOf('component'));
    // exp(3) against five classes of exp(0): e^3 / (e^3 + 5).
    expect(p[0]).toBeCloseTo(Math.exp(3) / (Math.exp(3) + 5), 10);
  });

  it('sums the rows of every known token', () => {
    const p = routeProbs(weights, 'table hook');
    expect(p[0]).toBeCloseTo(p[1], 10);
    expect(p[0]).toBeGreaterThan(p[2]);
  });

  it('is even across the classes when no token is known', () => {
    const p = routeProbs(weights, 'banana');
    for (const x of p) expect(x).toBeCloseTo(1 / ROUTES.length, 10);
  });
});
