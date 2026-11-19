// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A token set on a part that reads it only under a condition the part
 * is not drawn in by default (a link reads --color-text-primary only as
 * color primary) is set, and its note says it changes nothing in the
 * default look, naming the token that look reads and the condition that
 * reads this one, each with its line. A token the default look reads gets
 * no such note.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

const T = 300_000;
/** @type {string} */
let cwd;
beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-token-read-in-variant-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {any} r */
const variantNotes = r =>
  /** @type {string[]} */ (r.data.notes ?? []).filter(n =>
    /changes nothing in its default look/.test(n),
  );

describe('a token a part reads only in another variant', () => {
  it(
    'is set, with a note naming what the default look reads and the line for each',
    async () => {
      const r = /** @type {any} */ (
        await themeEditSet('t', '--color-text-primary', '#cfcfcf', {
          cwd,
          on: 'link',
        })
      );
      const [note] = variantNotes(r);
      expect(note).toMatch(
        /^link reads --color-text-primary only when color:primary/,
      );
      expect(note).toMatch(/set t --color-text-accent '#cfcfcf' --on link;/);
      expect(note).toMatch(
        /set t --color-text-primary '#cfcfcf' --on link --when color:primary$/,
      );
    },
    T,
  );

  it(
    'says nothing of the kind where the default look reads the token',
    async () => {
      const r = /** @type {any} */ (
        await themeEditSet('t', '--color-text-accent', '#1d4ed8', {
          cwd,
          on: 'link',
        })
      );
      expect(variantNotes(r)).toEqual([]);
    },
    T,
  );
});
