// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';

import {
  density,
  densityWords,
  fillerAt,
  fillerIn,
  floorTo,
  sharePercent,
} from './doc-fluff.mjs';
import {passageWords} from './copied-passages.mjs';

const words = (/** @type {string} */ text) =>
  passageWords(text).map(word => ({word}));

describe('fillerIn', () => {
  it('finds padding phrases in order, the longest one only', () => {
    expect(
      fillerIn(
        'In order to start, it is worth noting that you basically run it. Note that it builds.',
      ),
    ).toEqual(['in order to', 'it is worth noting', 'basically', 'note that']);
  });

  it('leaves inline code, quotes, a noun "note", and ambiguous words alone', () => {
    expect(
      fillerIn(
        'Run `basically --in order to`. Cut "in order to" and “basically”. Add a note that explains it. Copy just this one file; it really is the source.',
      ),
    ).toEqual([]);
  });

  it('sets aside single-quoted text, but not an apostrophe', () => {
    expect(
      fillerIn(
        "Avoid ‘basically’ and ‘obviously’. Don't write 'it is worth noting that' in a guide.",
      ),
    ).toEqual([]);
    expect(fillerIn("Don't pad: it's important to note the order.")).toEqual([
      "it's important to note",
    ]);
  });

  it('lists no phrase that carries meaning in a correct sentence', () => {
    expect(
      fillerIn(
        'It is not simply a wrapper. Every app gets a theme whether or not anyone picks one. Keep in mind the order. Feel free to skip it.',
      ),
    ).toEqual([]);
  });

  it('reads a curly apostrophe like a straight one', () => {
    expect(fillerIn('It’s important to note the order.')).toEqual([
      "it's important to note",
    ]);
  });
});

describe('fillerAt', () => {
  it('reads no phrase inside a link target or a hyphenated word', () => {
    expect(
      fillerIn(
        'Read {@link generic:obviously-fast} before you tune the build.',
      ),
    ).toEqual([]);
    expect(fillerIn('A non-obviously slow build still passes.')).toEqual([]);
    expect(fillerIn('It is obviously slow.')).toEqual(['obviously']);
  });

  it('marks a "that" the reader cuts with the phrase', () => {
    expect(
      fillerAt('It is worth noting that the cache is shared.').map(
        each => each.thatAfter,
      ),
    ).toEqual([true]);
    expect(
      fillerAt('Basically, the cache is shared.').map(each => each.thatAfter),
    ).toEqual([false]);
    // Only a note or noting phrase leads a clause the reader cuts.
    expect(
      fillerAt('Obviously that works only in a browser.').map(
        each => each.thatAfter,
      ),
    ).toEqual([false]);
    expect(
      fillerAt('As noted above that flag is required.').map(
        each => each.thatAfter,
      ),
    ).toEqual([false]);
  });
});

describe('densityWords', () => {
  it('measures prose only, not quoted text, inline code or links', () => {
    const doc = {
      sections: [
        {
          title: 'Overview',
          content: [
            {
              type: 'prose',
              text: 'Theme tokens set colors. Write "it is in the" or `of the` as {@link generic:theme} shows.',
            },
          ],
        },
      ],
    };
    expect(densityWords(doc).map(each => each.word)).toEqual([
      'theme',
      'tokens',
      'set',
      'colors.',
      'write',
      'or',
      'as',
      'shows.',
    ]);
  });
});

describe('share rounding', () => {
  it('rounds a share under the floor down, never up to it', () => {
    expect(floorTo(0.4995, 3)).toBe(0.499);
    expect(sharePercent(0.4995)).toBe('49.9%');
    expect(sharePercent(0.5)).toBe('50.0%');
  });
});

describe('density', () => {
  it('scores a padded sentence well below a dense one', () => {
    const padded = words(
      'So that is why it is the one that you would want to use if you can.',
    );
    const dense = words(
      'Name each codemod folder after the Core version whose upgrade runs it.',
    );
    expect(density(padded)).toBeLessThan(0.3);
    expect(density(dense)).toBeGreaterThan(0.6);
  });
});
