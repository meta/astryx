// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';

import {
  PASSAGE_WORDS,
  contentWords,
  passageWords,
  wordSpans,
  proseWords,
  sharedPassages,
} from './copied-passages.mjs';

const words = (/** @type {string} */ text) =>
  passageWords(text).map(word => ({word, section: null, block: 1}));

describe('passageWords', () => {
  it('sets aside case, links, and Markdown emphasis', () => {
    expect(
      passageWords('Use **`Button`** for {@link component:Button} actions.'),
    ).toEqual(['use', 'button', 'for', 'actions.']);
  });
});

describe('proseWords', () => {
  it('reads prose with its section, and skips code, references, and names', () => {
    const doc = {
      type: 'generic',
      name: 'acme-guide',
      title: 'Acme guide',
      description: 'Intro words.',
      sections: [
        {
          title: 'Setup',
          content: [
            {type: 'prose', text: 'Install it.'},
            {type: 'code', lang: 'sh', code: 'npm install acme'},
            {type: 'reference', ref: 'generic:other'},
            {type: 'list', items: ['First step.']},
          ],
        },
      ],
    };
    expect(proseWords(doc)).toEqual([
      {word: 'intro', section: null, block: 1},
      {word: 'words.', section: null, block: 1},
      {word: 'install', section: 'Setup', block: 2},
      {word: 'it.', section: 'Setup', block: 2},
      {word: 'first', section: 'Setup', block: 3},
      {word: 'step.', section: 'Setup', block: 3},
    ]);
  });
});

describe('sharedPassages', () => {
  const passage = Array.from(
    {length: PASSAGE_WORDS + 5},
    (_, i) => `w${i}`,
  ).join(' ');

  it('finds the longest shared run', () => {
    expect(
      sharedPassages(words(`a b ${passage} c`), words(`x ${passage} y`)),
    ).toEqual([{start: 2, length: PASSAGE_WORDS + 5}]);
  });

  it('never runs a passage from one string into the next', () => {
    const half = Math.ceil(PASSAGE_WORDS / 2);
    const first = passage.split(' ').slice(0, half).join(' ');
    const second = passage.split(' ').slice(half, PASSAGE_WORDS).join(' ');
    const split = [
      ...passageWords(first).map(word => ({word, section: null, block: 1})),
      ...passageWords(second).map(word => ({word, section: null, block: 2})),
    ];
    expect(sharedPassages(split, words(`${first} ${second}`))).toEqual([]);
  });

  it('ignores a run shorter than the passage size', () => {
    const short = passage
      .split(' ')
      .slice(0, PASSAGE_WORDS - 1)
      .join(' ');
    expect(
      sharedPassages(words(`a ${short} b`), words(`c ${short} d`)),
    ).toEqual([]);
  });
});

describe('contentWords', () => {
  it('counts distinct words that are not function words', () => {
    const run = words('and it is in the way that you can do it for them');
    expect(contentWords(run, 0, run.length)).toBe(1);
    const fact = words('Name each codemod folder after the Core version.');
    expect(contentWords(fact, 0, fact.length)).toBe(5);
  });
});

describe('wordSpans', () => {
  it('reads the words passageWords reads, with where each sits as written', () => {
    const text = 'Run `astryx docs`, then {@link generic:theme} *now*.';
    const spans = wordSpans(text);
    expect(spans.map(span => span.word)).toEqual(passageWords(text));
    expect(text.slice(spans[1].start, spans[2].end)).toBe('`astryx docs`');
  });
});

describe('passageWords and pointers', () => {
  it('reads a link and a written docs command as no words', () => {
    expect(
      passageWords(
        'See {@link generic:theme} or `astryx docs theme` (Share it).',
      ),
    ).toEqual(['see', 'or', 'share', 'it']);
  });

  it('counts no punctuation-only token as a word', () => {
    expect(
      passageWords('Set the theme first, see {@link generic:theme}.'),
    ).toEqual(['set', 'the', 'theme', 'first', 'see']);
    expect(
      wordSpans('Read it - then {@link generic:theme}.').map(s => s.word),
    ).toEqual(['read', 'it', 'then']);
  });
});
