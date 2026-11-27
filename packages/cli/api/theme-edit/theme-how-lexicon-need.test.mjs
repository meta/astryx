// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A made lexicon pattern (NeedRegExp) answers as the plain pattern
 * does on every text and through every string method, and never runs the
 * pattern on a text that lacks its word.
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {NeedRegExp} from './_how-question.mjs';

const SOURCE = String.raw`\bcard[\s-]?titles?\b`;
const TEXTS = [
  ' make the card titles bigger ',
  ' card-title and card title ',
  ' a calm dark theme ',
  '',
  ' cards ',
  ' CARD TITLES ',
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a made lexicon pattern', () => {
  it('answers as the plain pattern on every text and method', () => {
    for (const flags of ['', 'g', 'i']) {
      const plain = () => new RegExp(SOURCE, flags);
      const made = () => new NeedRegExp(SOURCE, flags, 'card');
      for (const text of TEXTS) {
        expect(made().test(text)).toBe(plain().test(text));
        expect(made().exec(text)).toEqual(plain().exec(text));
        expect(text.match(made())).toEqual(text.match(plain()));
        expect(text.replace(made(), '_')).toBe(text.replace(plain(), '_'));
        expect(text.split(made())).toEqual(text.split(plain()));
        expect(text.search(made())).toBe(text.search(plain()));
        if (flags.includes('g'))
          expect([...text.matchAll(made())]).toEqual([
            ...text.matchAll(plain()),
          ]);
      }
    }
  });

  it('keeps its word in a copy made from it', () => {
    const copy = new NeedRegExp(new NeedRegExp(SOURCE, '', 'card'), 'g');
    expect(copy.need).toBe('card');
    expect(copy.flags).toBe('g');
  });

  it('never runs the pattern on a text without its word', () => {
    const run = vi.spyOn(RegExp.prototype, 'exec');
    const made = new NeedRegExp(SOURCE, 'g', 'card');
    made.lastIndex = 3;
    expect(made.test(' a calm dark theme ')).toBe(false);
    expect(made.lastIndex).toBe(0);
    expect(run).not.toHaveBeenCalled();
    expect(made.test(' card titles ')).toBe(true);
    expect(run).toHaveBeenCalled();
  });
});
