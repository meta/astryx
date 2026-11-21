// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A size said for a plural family whose looks' sizes now are not all
 * lengths: each look takes the size said, and the answer says the steps
 * between them cannot be kept.
 */

import {describe, expect, it} from 'vitest';

import {oneAnswerPerFamily} from './_part-pieces.mjs';

describe('a plural family size when a look has no length size now', () => {
  it('says the steps cannot be kept, naming the look', () => {
    const whens = ['type:display-1', 'type:display-2', 'type:display-3'];
    const clause = {
      parts: whens.map(when => ({on: 'heading', when})),
    };
    const drafts = whens.map(when => ({
      text: `font size on heading (${when.replace(':', ' ')})`,
      options: [
        [{verb: 'set', thing: 'font-size', value: '72px', on: 'heading', when}],
      ],
    }));
    const now = {
      'type:display-1': 57,
      'type:display-2': null,
      'type:display-3': 36,
    };
    oneAnswerPerFamily(
      drafts,
      () => clause,
      [clause],
      [{on: 'heading', whens}],
      (w, on) => (on === 'heading' ? /** @type {any} */ (now)[w] : 0),
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0].text).toMatch(
      /the steps between them cannot be kept, since display-2's size now is no length/,
    );
    expect(
      drafts[0].options[0].map(st => /** @type {any} */ (st).value),
    ).toEqual(['72px', '72px', '72px']);
  });
});
