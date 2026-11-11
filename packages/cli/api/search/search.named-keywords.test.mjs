// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A doc keyword that is another entry's whole name is not a match in
 * search: the entry's own family members and its hook/component pair still
 * count, as does a word the entry's own description uses. searchCore, which
 * build reads, keeps every keyword. All entries here are made up.
 */

import {describe, expect, it} from 'vitest';
import {requireNatively} from '../../test-utils/native-require.mjs';

const require = requireNatively(import.meta.url);
/** @type {typeof import('./_named-keywords.mjs')} */
const {withoutOtherNames, searchView} = require('./_named-keywords.mjs');
/** @type {typeof import('./_lexical.mjs')} */
const {rankLexical} = require('./_lexical.mjs');

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

const Whirl = component('Whirl', {description: 'A turning loader.'});
const Dial = component('Dial', {
  keywords: ['whirl', 'knob', 'dial-row'],
  description: 'Picks a number by turning.',
});
const DialRow = component('DialRow', {_family: 'Dial'});
const Ledger = component('Ledger', {
  keywords: ['whirl'],
  description: 'Shows a whirl of entries.',
});
const Plank = component('Plank', {keywords: ['ledgers', 'dials', 'boards']});
const Tote = component('Tote', {keywords: ['crate']});
const Crate = component('Crate', {_family: 'Tote'});
const useBeacon = /** @type {Candidate} */ ({
  domain: 'hook',
  name: 'useBeacon',
  keywords: ['beacon', 'whirl'],
  description: '',
});
const Beacon = component('Beacon', {keywords: ['use-beacon']});
const page = /** @type {Candidate} */ ({
  domain: 'template',
  name: 'whirl-page',
  keywords: ['Whirl', 'Dial'],
  description: '',
});

const ALL = [
  Whirl,
  Dial,
  DialRow,
  Ledger,
  Plank,
  Tote,
  Crate,
  useBeacon,
  Beacon,
  page,
];

/** @param {string} name */
const keywordsOf = name =>
  withoutOtherNames(ALL).find(c => c.name === name)?.keywords;

describe('keywords that name another entry', () => {
  it("drops a keyword that is another entry's whole name", () => {
    expect(keywordsOf('Dial')).toEqual(['knob', 'dial-row']);
    expect(keywordsOf('useBeacon')).toEqual(['beacon']);
  });

  it('reads names by letters and digits, either plural', () => {
    expect(keywordsOf('Plank')).toEqual(['boards']);
  });

  it("keeps a keyword the entry's own description uses", () => {
    expect(keywordsOf('Ledger')).toEqual(['whirl']);
  });

  it('keeps a family member and a hook/component pair', () => {
    expect(keywordsOf('Dial')).toContain('dial-row');
    expect(keywordsOf('Tote')).toEqual(['crate']);
    expect(keywordsOf('Beacon')).toEqual(['use-beacon']);
  });

  it("leaves other domains' keywords and untouched entries as they are", () => {
    const out = withoutOtherNames(ALL);
    expect(out[ALL.indexOf(page)]).toBe(page);
    expect(out[ALL.indexOf(Whirl)]).toBe(Whirl);
    expect(Dial.keywords).toEqual(['whirl', 'knob', 'dial-row']);
  });

  it('gives a reused catalog the same view', () => {
    const catalog = {all: ALL, components: [Whirl, Dial]};
    const view = searchView(catalog);
    expect(searchView(catalog)).toBe(view);
    expect(view.components[1]).toBe(view.all[1]);
    expect(catalog.all[1]).toBe(Dial);
  });
});

describe('ranking with and without the rule', () => {
  const catalog = {
    all: ALL,
    components: ALL.filter(c => c.domain === 'component'),
    searchedComponents: false,
  };
  /** @param {any} response */
  const names = response => response.data.results.map(r => r.name);

  it("search's view finds no keyword match on another entry's name", () => {
    const found = names(rankLexical('whirl', {}, searchView(catalog)));
    expect(found).toContain('Whirl');
    expect(found).not.toContain('Dial');
    expect(found).toContain('Ledger');
  });

  it('the gathered catalog, as searchCore and build read it, still matches', () => {
    const found = names(rankLexical('whirl', {}, catalog));
    expect(found).toContain('Dial');
  });
});
