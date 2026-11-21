// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file In search's view, an entry that is not a doc takes the every-word
 * tier only with two strong query words: a keyword-strength hit, or a word of
 * its own name or the start of one. One strong word
 * and a mention of the others stays on the token sum. A doc answers in prose,
 * so one strong word still lifts it. searchCore, which build reads, keeps the
 * bar of one. All entries here are made up.
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
 * @param {'component' | 'hook' | 'template' | 'doc'} domain
 * @param {string} name
 * @param {Partial<Candidate>} [rest]
 * @returns {Candidate}
 */
const entry = (domain, name, rest = {}) => ({
  domain,
  name,
  keywords: [],
  description: '',
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

describe('the every-word tier in search', () => {
  const mention = entry('component', 'Teeter', {
    keywords: ['quake'],
    description: 'Rocks on a stand while it loads.',
  });
  const both = entry('component', 'Pedestal', {keywords: ['quake', 'stand']});
  const guide = entry('doc', 'guides/teeter', {
    titles: ['Teeter'],
    keywords: ['quake'],
    description: 'Put it on a stand.',
  });
  const all = [mention, both, guide];

  it('keeps a component with one strong word below the tier', () => {
    const view = rankLexical('quake stand', {}, searchView(catalog(all)));
    expect(scoreOf(view, 'Teeter')).toBeLessThan(FULL_COVERAGE_SCORE);
  });

  it('lifts a component with a strong hit on both words', () => {
    const view = rankLexical('quake stand', {}, searchView(catalog(all)));
    expect(scoreOf(view, 'Pedestal')).toBeGreaterThanOrEqual(
      FULL_COVERAGE_SCORE,
    );
  });

  it('counts a word of its own name as a strong word', () => {
    const named = entry('template', 'TeeterStates', {
      keywords: ['quake'],
      description: 'Each state of a stand.',
    });
    const view = rankLexical(
      'quake state',
      {},
      searchView(catalog([...all, named])),
    );
    expect(scoreOf(view, 'TeeterStates')).toBeGreaterThanOrEqual(
      FULL_COVERAGE_SCORE,
    );
  });

  it('counts the start of a word of its own name as a strong word', () => {
    const folding = entry('component', 'ZentaFoldablePanel', {
      keywords: ['panel'],
      description: 'Can fold its content away.',
    });
    const view = rankLexical(
      'fold panel',
      {},
      searchView(catalog([...all, folding])),
    );
    expect(scoreOf(view, 'ZentaFoldablePanel')).toBeGreaterThanOrEqual(
      FULL_COVERAGE_SCORE,
    );
  });

  it('does not count a word its description alone answers', () => {
    const drawer = entry('component', 'ZentaDrawer', {
      keywords: ['panel'],
      description: 'Slides out and can fold away.',
    });
    const view = rankLexical(
      'fold panel',
      {},
      searchView(catalog([...all, drawer])),
    );
    expect(scoreOf(view, 'ZentaDrawer')).toBeLessThan(FULL_COVERAGE_SCORE);
  });

  it('lifts a doc with one strong word and the others in its prose', () => {
    const view = rankLexical('quake stand', {}, searchView(catalog(all)));
    expect(scoreOf(view, 'guides/teeter')).toBeGreaterThanOrEqual(
      FULL_COVERAGE_SCORE,
    );
  });

  it('keeps the bar of one in the gathered catalog, as searchCore and build read it', () => {
    const raw = rankLexical('quake stand', {}, catalog(all));
    expect(scoreOf(raw, 'Teeter')).toBeGreaterThanOrEqual(FULL_COVERAGE_SCORE);
  });
});
