// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A one-identifier query that a doc only mentions: written as an
 * entry's name (PascalCase), it is also read as its words, so the entries
 * those words name join the doc that mentions it; written as a prop's name
 * (camelCase), it keeps only the entries that mention it. All entries here
 * are made up.
 */

import {describe, expect, it} from 'vitest';
import {requireNatively} from '../../test-utils/native-require.mjs';

const require = requireNatively(import.meta.url);
/** @type {typeof import('./_lexical.mjs')} */
const {rankLexical} = require('./_lexical.mjs');

/** @typedef {import('./_lexical.mjs').Candidate} Candidate */

/**
 * @param {string} domain
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

const Lantern = entry('component', 'Lantern', {
  description: 'Lights a part of the page.',
});
const useLantern = entry('hook', 'useLantern', {
  description: 'The lantern a part is lit by.',
});
const Shelf = entry('component', 'Shelf', {
  description: 'Holds things in a row.',
});
// A field reference that names a manifest key and a prop in its text only.
const manifest = entry('doc', 'manifest-fields', {
  description: 'Every field of the manifest.',
  prose: [
    'Name the component that lights your parts as `lanternKeeper: {export, from}`. A part with `glowOnHover` lights when hovered.',
  ],
});

const catalog = {
  all: [Lantern, useLantern, Shelf, manifest],
  components: [Lantern, Shelf],
  searchedComponents: false,
};
/** @param {string} query */
const names = query =>
  rankLexical(query, {}, catalog).data.results.map(r => r.name);

describe('an identifier only text mentions', () => {
  it('written as an entry name, also finds the entries its words name, beside the doc', () => {
    const found = names('LanternKeeper');
    expect(found).toEqual(
      expect.arrayContaining(['Lantern', 'useLantern', 'manifest-fields']),
    );
    expect(found).not.toContain('Shelf');
  });

  it('written as a prop name, keeps only the text that mentions it', () => {
    expect(names('glowOnHover')).toEqual(['manifest-fields']);
  });

  it('that names an entry outright, answers with that entry', () => {
    expect(names('Lantern')[0]).toBe('Lantern');
  });
});
