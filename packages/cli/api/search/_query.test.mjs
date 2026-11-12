// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How search reads a query: the domains it covers, the filler words it
 * strips, the content tokens it keeps, and the plural-tolerant phrase
 * matching the title rules use.
 */

import {describe, expect, it} from 'vitest';
import {
  CORELESS_DOMAINS,
  SEARCH_DOMAINS,
  STOPWORDS,
  phraseWords,
  pluralOf,
  samePhrase,
  samePhraseWord,
  tokenizeQuery,
} from './_query.mjs';

describe('domains', () => {
  it('lists the five domains a search covers', () => {
    expect(SEARCH_DOMAINS).toEqual([
      'component',
      'hook',
      'doc',
      'template',
      'theme',
    ]);
  });

  it('reads outside an app only domains that a search covers', () => {
    expect(CORELESS_DOMAINS).toEqual(['doc', 'theme']);
    for (const domain of CORELESS_DOMAINS)
      expect(SEARCH_DOMAINS).toContain(domain);
  });
});

describe('STOPWORDS', () => {
  it('holds only lowercase, trimmed, non-empty words', () => {
    expect(STOPWORDS).toBeInstanceOf(Set);
    for (const word of STOPWORDS) {
      expect(word, word).toBe(word.trim().toLowerCase());
      expect(word.length, word).toBeGreaterThan(0);
    }
  });

  it('holds the filler of a natural-language query', () => {
    for (const word of ['a', 'the', 'with', 'where', 'you', 'page', 'build'])
      expect(STOPWORDS.has(word), word).toBe(true);
  });

  it('keeps the words that name what a reader wants', () => {
    for (const word of ['table', 'button', 'form', 'dashboard', 'login'])
      expect(STOPWORDS.has(word), word).toBe(false);
  });
});

describe('tokenizeQuery', () => {
  it('keeps the content words of a natural-language query', () => {
    expect(tokenizeQuery('a page where you can see business stats')).toEqual([
      'see',
      'business',
      'stats',
    ]);
  });

  it('keeps the order the words were typed in', () => {
    expect(tokenizeQuery('filter data table')).toEqual([
      'filter',
      'data',
      'table',
    ]);
  });

  it('gives one token for a one-word query', () => {
    // Callers read a single token as "few tokens" and fall back to scoring
    // the whole phrase; an empty list would mean the query had no content.
    expect(tokenizeQuery('table')).toEqual(['table']);
  });

  it('strips punctuation around a word and keeps it inside', () => {
    expect(tokenizeQuery('"data-table," (filters)!')).toEqual([
      'data-table',
      'filters',
    ]);
    expect(tokenizeQuery('foo_bar baz.qux')).toEqual(['foo_bar', 'baz.qux']);
  });

  it('drops one-character words', () => {
    expect(tokenizeQuery('x table')).toEqual(['table']);
  });

  it('drops a word that is only punctuation', () => {
    expect(tokenizeQuery('table ... --- filters')).toEqual([
      'table',
      'filters',
    ]);
  });

  it('splits on any run of whitespace', () => {
    expect(tokenizeQuery('data \t  table\nfilters')).toEqual([
      'data',
      'table',
      'filters',
    ]);
  });

  it('gives no tokens for an empty, blank, or all-filler query', () => {
    expect(tokenizeQuery('')).toEqual([]);
    expect(tokenizeQuery('   ')).toEqual([]);
    expect(tokenizeQuery('the of a')).toEqual([]);
  });
});

describe('phraseWords', () => {
  it('lowercases and splits on punctuation', () => {
    expect(phraseWords('Side-panels: Data, Tables')).toEqual([
      'side',
      'panels',
      'data',
      'tables',
    ]);
  });

  it('reads code ticks and underscores as word breaks', () => {
    expect(phraseWords('`use_state` hook')).toEqual(['use', 'state', 'hook']);
  });

  it('keeps digits', () => {
    expect(phraseWords('Grid 2 columns')).toEqual(['grid', '2', 'columns']);
  });

  it('gives no words for empty or punctuation-only text', () => {
    expect(phraseWords('')).toEqual([]);
    expect(phraseWords('***')).toEqual([]);
  });
});

describe('samePhraseWord', () => {
  it('is true for the same word', () => {
    expect(samePhraseWord('box', 'box')).toBe(true);
  });

  it('allows a plural on either side', () => {
    expect(samePhraseWord('panel', 'panels')).toBe(true);
    expect(samePhraseWord('panels', 'panel')).toBe(true);
    expect(samePhraseWord('box', 'boxes')).toBe(true);
    expect(samePhraseWord('boxes', 'box')).toBe(true);
  });

  it('is false for different words', () => {
    expect(samePhraseWord('cat', 'dog')).toBe(false);
    expect(samePhraseWord('panel', 'panelled')).toBe(false);
  });
});

describe('samePhrase', () => {
  it('ignores case, punctuation, and a plural on any word', () => {
    expect(
      samePhrase('data attributes selector', 'Data attribute selectors'),
    ).toBe(true);
    expect(samePhrase('headers and footers', 'header-and-footer')).toBe(true);
    expect(samePhrase('side panel', 'Side panels')).toBe(true);
    expect(samePhrase('Side Panel', 'side panel')).toBe(true);
  });

  it('needs the same words in the same order', () => {
    expect(samePhrase('panel side', 'side panel')).toBe(false);
  });

  it('needs the same number of words', () => {
    expect(samePhrase('side panel', 'side')).toBe(false);
    expect(samePhrase('side', 'side panel')).toBe(false);
  });

  it('is false for two empty phrases', () => {
    expect(samePhrase('', '')).toBe(false);
    expect(samePhrase('***', '---')).toBe(false);
  });
});

describe('pluralOf', () => {
  it('reads a trailing s as a plural', () => {
    expect(pluralOf('integrations', 'integration')).toBe(true);
    expect(pluralOf('tests', 'test')).toBe(true);
  });

  it('reads es as a plural only after s, x, z, ch, or sh', () => {
    expect(pluralOf('boxes', 'box')).toBe(true);
    expect(pluralOf('buses', 'bus')).toBe(true);
    expect(pluralOf('watches', 'watch')).toBe(true);
    expect(pluralOf('dishes', 'dish')).toBe(true);
    expect(pluralOf('notes', 'not')).toBe(false);
  });

  it('never reads a word of under three letters as having a plural', () => {
    expect(pluralOf('as', 'a')).toBe(false);
    expect(pluralOf('s', '')).toBe(false);
  });

  it('is false for the same word and for the reverse direction', () => {
    expect(pluralOf('cat', 'cat')).toBe(false);
    expect(pluralOf('cats', 'cats')).toBe(false);
    expect(pluralOf('test', 'tests')).toBe(false);
  });
});
