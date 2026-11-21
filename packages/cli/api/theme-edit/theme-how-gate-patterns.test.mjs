// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The every-word gate's patterns are made once for each lexicon, and
 * blank out the same part names as patterns made fresh for each clause.
 */

import {describe, expect, it} from 'vitest';
import {NeedRegExp, blankParts, gatePatternsOf} from './_how-question.mjs';
import {STATE_WORDS} from './_how-words.mjs';

/** A lexicon with made, written, case-blind and global part patterns. */
const lexicon = () => ({
  parts: [
    [
      new NeedRegExp(String.raw`\bcard[\s-]?titles?\b`, '', 'card'),
      {on: 'card-title'},
    ],
    [new NeedRegExp(String.raw`\bcards?\b`, '', 'card'), {on: 'card'}],
    [/\bheaders?\b/, {on: 'header'}],
    [/\bnav\b/i, {on: 'nav'}],
    [new NeedRegExp(String.raw`\bbuttons?\b`, 'g', 'button'), {on: 'button'}],
  ],
});

const TEXTS = [
  ' make the card titles bigger on hover ',
  ' cards and headers when focused ',
  ' the NAV bar ',
  ' a calm dark theme ',
  '',
  ' card card-title card ',
  ' buttons pressed ',
];

/**
 * The text with every part name blanked out by patterns made fresh for it.
 * @param {string} text
 * @param {ReturnType<typeof lexicon>} lex
 */
const blankedFresh = (text, lex) =>
  lex.parts.reduce(
    (t, [re]) =>
      t.replace(
        new RegExp(
          re.source,
          re.flags.includes('g') ? re.flags : `${re.flags}g`,
        ),
        ' ',
      ),
    text,
  );

describe("the every-word gate's patterns", () => {
  it('are made once for a lexicon, and apart for another lexicon', () => {
    const lex = lexicon();
    expect(gatePatternsOf(lex)).toBe(gatePatternsOf(lex));
    expect(gatePatternsOf(lexicon())).not.toBe(gatePatternsOf(lex));
  });

  it('blank out the part names fresh patterns blank out, on every run', () => {
    const lex = lexicon();
    const {parts} = gatePatternsOf(lex);
    for (let run = 0; run < 2; run++)
      for (const text of TEXTS)
        expect(blankParts(text, parts), text).toBe(blankedFresh(text, lex));
  });

  it('keep each state word with no flags', () => {
    const {states} = gatePatternsOf(lexicon());
    expect(states.map(([re, st]) => [re.source, re.flags, st])).toEqual(
      STATE_WORDS.map(([re, st]) => [re.source, '', st]),
    );
  });
});
