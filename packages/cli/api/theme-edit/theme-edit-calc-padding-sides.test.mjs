// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A padding of two to four lengths on a part whose Core box reads its
 * padding inside calc() (a menu, a segmented control), where one length is
 * all that works, is written as its sides, as CSS gives them out, each with
 * the length typed for it: `5px 0` is padding-block 5px and padding-inline
 * 0. The result names them, and one undo takes back all of them. The same
 * length said for every side is that one length.
 */

import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditUndo} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

const T = 240_000;

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-calc-padding-sides-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** The theme's saved settings as `thing value`. */
const saved = () =>
  JSON.parse(
    readFileSync(join(cwd, 'themes', 't', 't.settings.json'), 'utf8'),
  ).settings.map(
    (/** @type {{thing: string, value: string}} */ x) =>
      `${x.thing} ${x.value}`,
  );

/** Sets a padding on the menu and returns its notes. @param {string} v */
const set = async v =>
  (await themeEditSet('t', 'padding', v, {cwd, on: 'dropdown-menu'})).data
    .notes;

describe('a padding of several lengths where only one works', () => {
  it(
    'is written as its sides, named, and one undo takes back all',
    async () => {
      expect((await set('5px 0')).join('\n')).toContain(
        "wrote padding '5px 0' as its sides, padding-block 5px, padding-inline 0",
      );
      expect(saved()).toEqual(['padding-block 5px', 'padding-inline 0']);
      await themeEditUndo('t', {cwd});
      expect(saved()).toEqual([]);
      // (The result names the value typed and the sides written for it.)
      const r = await themeEditSet('t', 'padding', '5px 0', {
        cwd,
        on: 'dropdown-menu',
      });
      expect(r.data.asSides).toMatchObject({
        thing: 'padding',
        value: '5px 0',
        sides: [
          {thing: 'padding-block', value: '5px'},
          {thing: 'padding-inline', value: '0'},
        ],
      });
      await themeEditUndo('t', {cwd});
      await set('2px 15px 3px');
      expect(saved()).toEqual([
        'padding-top 2px',
        'padding-inline 15px',
        'padding-bottom 3px',
      ]);
      await themeEditUndo('t', {cwd});
      await set('1px 2px 3px 4px');
      expect(saved()).toEqual([
        'padding-top 1px',
        'padding-right 2px',
        'padding-bottom 3px',
        'padding-left 4px',
      ]);
      await themeEditUndo('t', {cwd});
    },
    T,
  );

  it(
    'is the one length when each side says the same',
    async () => {
      expect((await set('5px 5px')).join('\n')).toContain(
        '"5px 5px" is 5px on every side',
      );
      expect(saved()).toEqual(['padding 5px']);
      await themeEditUndo('t', {cwd});
    },
    T,
  );

  it(
    'replaces a side set before it, as a plain side set does',
    async () => {
      await themeEditSet('t', 'padding-left', '9px', {
        cwd,
        on: 'dropdown-menu',
      });
      const notes = (await set('5px 0')).join('\n');
      expect(notes).toContain(
        "padding '5px 0' comes after padding-left on dropdown-menu, so it replaces them there",
      );
      expect(saved()).toEqual(['padding-block 5px', 'padding-inline 0']);
      await themeEditUndo('t', {cwd});
      expect(saved()).toEqual(['padding-left 9px']);
      await themeEditUndo('t', {cwd});
    },
    T,
  );

  it(
    'says nothing of an undo when set again with no change',
    async () => {
      await set('5px 0');
      const notes = (await set('5px 0')).join('\n');
      expect(notes).not.toContain('takes back all');
      expect(notes).toContain(
        'no change: padding = 5px 0 on dropdown-menu (padding-block 5px, padding-inline 0) is already set',
      );
      await themeEditUndo('t', {cwd});
    },
    T,
  );

  it(
    "lets each side's own check read its value",
    async () => {
      await set('5px 10%');
      expect(saved()).toEqual(['padding-block 5px', 'padding-inline 10%']);
      await themeEditUndo('t', {cwd});
    },
    T,
  );

  it(
    'names every side a later group setting hides',
    async () => {
      await set('5px 0');
      const r = await themeEditSet('t', 'padding', '3px 2px', {
        cwd,
        on: 'menus',
      });
      const notes = r.data.notes.join('\n');
      expect(notes).toMatch(
        /padding-block = 5px on dropdown-menu no longer shows/,
      );
      expect(notes).toMatch(
        /padding-inline = 0 on dropdown-menu no longer shows/,
      );
      await themeEditUndo('t', {cwd});
      await themeEditUndo('t', {cwd});
    },
    T,
  );

  it(
    'writes the same value on every side as sides when it is no one length',
    async () => {
      await set('10% 10%');
      expect(saved()).toEqual(['padding-block 10%', 'padding-inline 10%']);
      await themeEditUndo('t', {cwd});
    },
    T,
  );

  it(
    'replaces an earlier padding on the part, and its undo brings it back',
    async () => {
      await set('4px');
      const notes = (await set('5px 0')).join('\n');
      expect(saved()).toEqual(['padding-block 5px', 'padding-inline 0']);
      expect(notes).toMatch(/replaces padding = 4px on dropdown-menu/);
      await themeEditUndo('t', {cwd});
      expect(saved()).toEqual(['padding 4px']);
      await themeEditUndo('t', {cwd});
      expect(saved()).toEqual([]);
    },
    T,
  );

  it(
    'adds no undo step for a repeat that changes nothing after another change',
    async () => {
      await set('5px 0');
      await themeEditSet('t', 'padding', '6px', {
        cwd,
        on: 'segmented-control',
      });
      const r = await themeEditSet('t', 'padding', '5px 0', {
        cwd,
        on: 'dropdown-menu',
      });
      expect(r.data.notes.join('\n')).not.toMatch(/as its sides/);
      expect(saved()).toEqual([
        'padding-block 5px',
        'padding-inline 0',
        'padding 6px',
      ]);
      // The next undo takes back the segmented control's padding.
      await themeEditUndo('t', {cwd});
      expect(saved()).toEqual(['padding-block 5px', 'padding-inline 0']);
      await themeEditUndo('t', {cwd});
      expect(saved()).toEqual([]);
    },
    T,
  );

  it(
    'names in its undo only the sides a change changes',
    async () => {
      await set('5px 0');
      const notes = (await set('5px 2px')).join('\n');
      expect(notes).toContain(
        'undo t takes back padding-inline, the side this changes or moves',
      );
      await themeEditUndo('t', {cwd});
      await themeEditUndo('t', {cwd});
      expect(saved()).toEqual([]);
    },
    T,
  );

  it(
    'names in its undo every side a repeat moves back over a group setting',
    async () => {
      await set('5px 0');
      await themeEditSet('t', 'padding', '3px 2px', {cwd, on: 'menus'});
      const notes = (await set('5px 0')).join('\n');
      expect(notes).toContain('undo t takes back all 2');
      await themeEditUndo('t', {cwd});
      await themeEditUndo('t', {cwd});
      await themeEditUndo('t', {cwd});
      expect(saved()).toEqual([]);
    },
    T,
  );
});
