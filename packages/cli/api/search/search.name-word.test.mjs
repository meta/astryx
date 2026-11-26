// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file In search's view, a query word that is a whole word of a component's
 * or hook's name is a name hit, however short against the name, when it has
 * three or more letters. A hook's leading `use` and a template's name keep
 * today's rule, and so does searchCore, which build reads. All entries here
 * are made up.
 */

import {describe, expect, it} from 'vitest';
import {requireNatively} from '../../test-utils/native-require.mjs';

const require = requireNatively(import.meta.url);
/** @type {typeof import('./_named-keywords.mjs')} */
const {searchView} = require('./_named-keywords.mjs');
/** @type {typeof import('./_lexical.mjs')} */
const {rankLexical} = require('./_lexical.mjs');

/** @typedef {import('./_lexical.mjs').Candidate} Candidate */

/**
 * @param {'component' | 'hook' | 'template'} domain
 * @param {string} name
 * @returns {Candidate}
 */
const entry = (domain, name) => ({
  domain,
  name,
  keywords: [],
  description: 'Holds things.',
  ...(domain === 'template' ? {prose: [], _kind: 'block'} : {}),
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
const hitOf = (response, name) =>
  response.data.results.find(r => r.name === name);

describe('a whole word of a name', () => {
  const all = [
    entry('component', 'QuillComposerPanel'),
    entry('hook', 'useQuillComposerState'),
    entry('template', 'QuillComposerPanelBlock'),
  ];

  it('is a name hit for a component and a hook in search', () => {
    const view = rankLexical('quill', {}, searchView(catalog(all)));
    for (const name of ['QuillComposerPanel', 'useQuillComposerState']) {
      expect(hitOf(view, name)).toMatchObject({
        score: 60,
        reason: 'name contains "quill"',
      });
    }
  });

  it("keeps today's rule for a template's name", () => {
    const view = rankLexical('quill', {}, searchView(catalog(all)));
    expect(hitOf(view, 'QuillComposerPanelBlock')).toBeUndefined();
  });

  it("is not a hook's leading use", () => {
    const view = rankLexical('use', {}, searchView(catalog(all)));
    expect(hitOf(view, 'useQuillComposerState')).toBeUndefined();
  });

  it('is not a synonym standing in for the query word', () => {
    const chat = [entry('component', 'ZetaChatToggleButton')];
    const view = rankLexical('inbox', {}, searchView(catalog(chat)));
    expect(hitOf(view, 'ZetaChatToggleButton')).toBeUndefined();
    const named = rankLexical('chat', {}, searchView(catalog(chat)));
    expect(hitOf(named, 'ZetaChatToggleButton')).toMatchObject({
      score: 60,
      reason: 'name contains "chat"',
    });
  });

  it('needs three or more letters', () => {
    const short = [entry('component', 'ZetaAsPanel')];
    const view = rankLexical('as', {}, searchView(catalog(short)));
    expect(hitOf(view, 'ZetaAsPanel')).toBeUndefined();
  });

  it('is no name hit in the gathered catalog, as searchCore and build read it', () => {
    const raw = rankLexical('quill', {}, catalog(all));
    expect(hitOf(raw, 'QuillComposerPanel')).toBeUndefined();
  });
});
