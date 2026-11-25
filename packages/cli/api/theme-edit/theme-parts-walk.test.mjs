// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * The census walk reads each CSS value's variables once for one walk, and an
 * element that sets no variable shares its parent's: what a part reads is
 * unchanged. A second walk with other declarations gets its own answers, and
 * a variable a child sets never reaches its sibling.
 */

import {describe, expect, it} from 'vitest';
import {declarations, walkMarkup} from './_parts.mjs';

const tokens = new Set(['--color-a', '--color-b']);

/**
 * The tokens part `key` reads for `prop` in `walk`.
 * @param {ReturnType<typeof walkMarkup>} walk
 * @param {string} key
 * @param {string} prop
 */
const reads = (walk, key, prop) =>
  Object.keys(walk.map[key]?.own[prop]?.tokens ?? {}).sort();

describe('the census walk', () => {
  it('gives a second walk with other declarations its own answers', () => {
    const html =
      '<div class="astryx-card x1a"><span class="astryx-label x1b">Hi</span></div>';
    const first = walkMarkup(
      html,
      declarations('.x1a{--x:var(--color-a)}.x1b{color:var(--x)}'),
      tokens,
    );
    const second = walkMarkup(
      html,
      declarations('.x1a{--x:var(--color-b)}.x1b{color:var(--x)}'),
      tokens,
    );
    expect(reads(first, 'label', 'color')).toEqual(['--color-a']);
    expect(reads(second, 'label', 'color')).toEqual(['--color-b']);
  });

  it('keeps a variable a child sets from its sibling', () => {
    const html =
      '<div class="astryx-card x1a"><span class="astryx-label x1b">Hi</span>' +
      '<span class="astryx-badge x1c">Yo</span></div>';
    const walk = walkMarkup(
      html,
      declarations(
        '.x1a{--x:var(--color-b)}' +
          '.x1b{--x:var(--color-a);color:var(--x)}' +
          '.x1c{color:var(--x)}',
      ),
      tokens,
    );
    expect(reads(walk, 'label', 'color')).toEqual(['--color-a']);
    expect(reads(walk, 'badge', 'color')).toEqual(['--color-b']);
  });
});
