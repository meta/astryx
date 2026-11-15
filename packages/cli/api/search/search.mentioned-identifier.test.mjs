// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A one-identifier query that docs only mention: written as an entry's
 * name (PascalCase), it is also read as its words, and the doc that mentions
 * it, and an entry a word names outright, come before entries the words only
 * match; written as a prop's name (camelCase), it keeps only the entries
 * that mention it. A code term or table cell a doc's keywords gather is a
 * mention; a keyword the doc declares, and a guide's route written with
 * spaces, are not. All entries here are made up.
 */

import {describe, expect, it} from 'vitest';
import {requireNatively} from '../../test-utils/native-require.mjs';

const require = requireNatively(import.meta.url);
/** @type {typeof import('./_lexical.mjs')} */
const {rankLexical, readsMentionAsWords} = require('./_lexical.mjs');
/** @type {typeof import('./_doc-text.mjs')} */
const {codeTerms, sectionProse} = require('./_doc-text.mjs');

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
// Matches one of the words only by a keyword.
const Shelf = entry('component', 'Shelf', {
  keywords: ['keeper'],
  description: 'Holds things in a row.',
});
// A field reference section, gathered as the docs gatherer gathers one: its
// title and its ticked identifiers are its keywords, and it declares none.
const fields = {
  title: 'Manifest fields',
  content: [
    {
      type: 'prose',
      text: 'Name the component that lights your parts as `lanternKeeper`. A part with `glowOnHover` lights when hovered.',
    },
  ],
};
const manifest = entry('doc', 'manifest-fields', {
  keywords: [fields.title, ...codeTerms(fields)],
  titles: [fields.title],
  _topic: 'manifest-fields',
  description: 'Every field of the manifest.',
  prose: sectionProse(fields),
});

/** @param {Candidate[]} all */
const catalog = all => ({
  all,
  components: all.filter(c => c.domain === 'component'),
  searchedComponents: false,
});
/** @param {string} query @param {Candidate[]} [all] */
const names = (query, all = [Lantern, useLantern, Shelf, manifest]) =>
  rankLexical(query, {}, catalog(all)).data.results.map(r => r.name);

describe('an identifier only docs mention', () => {
  it('written as an entry name: the entry a word names, then the doc that mentions it, then word-only matches', () => {
    expect(names('LanternKeeper')).toEqual([
      'Lantern',
      'manifest-fields',
      'Shelf',
      'useLantern',
    ]);
  });

  it('written as a prop name, keeps only the doc that mentions it', () => {
    expect(names('glowOnHover')).toEqual(['manifest-fields']);
  });

  it('a keyword the doc declares is no mention: the identifier is read whole', () => {
    const declared = {
      ...manifest,
      keywords: [...(manifest.keywords ?? []), 'lanternkeeper'],
      _declared: ['lanternkeeper'],
    };
    expect(
      names('LanternKeeper', [Lantern, useLantern, Shelf, declared]),
    ).toEqual(['manifest-fields']);
  });

  it('beside a keyword hit is read whole, by score: the keyword before a mention', () => {
    // A template declares the identifier as a keyword, and a component's
    // guidance only mentions it: not read as words, so no mention moves.
    const page = entry('template', 'lantern-page', {
      keywords: ['LanternKeeper'],
    });
    const Lamp = entry('component', 'Lamp', {
      guidance: ['Pair it with a LanternKeeper.'],
    });
    expect(names('LanternKeeper', [Lamp, page, Lantern])).toEqual([
      'lantern-page',
      'Lamp',
    ]);
  });

  it("a guide's route typed as one identifier answers only that guide", () => {
    // A placed guide answers to its route's last part written with spaces.
    const guide = entry('doc', 'authoring/tokens-border', {
      keywords: ['tokens border', 'Borders from tokens'],
      titles: ['Borders from tokens'],
      description: 'Draw a border from the theme tokens.',
    });
    const Border = entry('component', 'Border', {
      description: 'A line around a part.',
    });
    expect(names('TokensBorder', [guide, Border, Lantern])).toEqual([
      'authoring/tokens-border',
    ]);
  });

  it('that names an entry outright, answers with that entry', () => {
    expect(names('Lantern')[0]).toBe('Lantern');
  });

  it('the scope is one rule: PascalCase reads a mention as words, camelCase does not', () => {
    expect(readsMentionAsWords('ThemeProvider')).toBe(true);
    expect(readsMentionAsWords('ChevronDownIcon')).toBe(true);
    expect(readsMentionAsWords('autoFocus')).toBe(false);
  });
});
