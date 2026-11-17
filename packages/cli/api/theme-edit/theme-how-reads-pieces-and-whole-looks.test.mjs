// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `how` reads a part's own piece and a whole look as said. A top
 * nav's links or items are its items, never the top nav and every link. A
 * look named after a product ("make it Acme") is never guessed: the answer
 * asks for its colors, font, corners and spacing, or a picture of it. One
 * variant made to look like another ("ghost buttons look like the default
 * button") takes that variant's look, written for its own variant only,
 * never a reset; the default is the variant the part has when none is
 * given. A part's own piece taken away is not drawn; a whole part taken
 * away is the app's call. A display heading sizes from its display token.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-how-looks-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} q */
const answer = async q => (await themeEditHow(q, {cwd, theme: 't'})).data;

/** The first answer's lines, without the command prefix. @param {any} data */
const first = data =>
  (data.results ?? [])
    .find((/** @type {any} */ r) => r.commands.some((/** @type {string} */ c) => / editor (set|undo) /.test(c)))
    ?.commands.map((/** @type {string} */ c) => c.replace(/^.*? editor /, '')) ?? [];

describe("a top nav's links and items", () => {
  it(
    'are its items',
    async () => {
      for (const q of [
        'top nav links accent colored',
        'top nav items bigger',
        'navbar links bold',
      ]) {
        const lines = first(await answer(q));
        expect(lines.length, q).toBeGreaterThan(0);
        for (const l of lines) expect(l, q).toMatch(/--on top-nav-item\b/);
      }
    },
    T,
  );
});

describe('a look named after a product', () => {
  it(
    'is never guessed: the answer asks for its colors, font, corners and spacing, or a picture',
    async () => {
      for (const q of ['make it Acme 2', 'make it look like Acme']) {
        const data = await answer(q);
        expect(first(data), q).toEqual([]);
        const text = JSON.stringify(data.results);
        expect(text, q).toMatch(/does not know what \\"acme\\" looks like/);
        expect(text, q).toMatch(/its font, how round its corners are/);
        expect(text, q).toMatch(/picture/);
      }
    },
    T,
  );
});

describe('one variant made to look like another', () => {
  it(
    "takes that variant's look on its own variant only; the default is the variant a part has when none is given",
    async () => {
      for (const q of [
        'ghost buttons look like the default button',
        'make ghost buttons look like secondary buttons',
      ]) {
        const lines = first(await answer(q));
        expect(lines.length, q).toBeGreaterThan(0);
        for (const l of lines) {
          expect(l, q).toMatch(/^set t /);
          expect(l, q).toMatch(/--on button --when variant:ghost\b/);
        }
        expect(lines.some(l => /^set t background-color /.test(l)), q).toBe(
          true,
        );
      }
      const primary = first(
        await answer('ghost buttons should look like the primary ones'),
      );
      expect(primary).toContain(
        "set t background-color 'var(--color-accent)' --on button --when variant:ghost",
      );
    },
    T,
  );

  it(
    'leaves "look like before" a reset',
    async () => {
      const data = await answer('make the cards look like before');
      expect(JSON.stringify(data.results)).not.toMatch(/variant:/);
    },
    T,
  );
});

describe("a part's own piece taken away", () => {
  it(
    'is not drawn: display none on that element, never a look and never the whole part',
    async () => {
      for (const [q, on] of [
        ['hide the code block copy button', 'code-block-copy-button'],
        ['no copy button on code blocks', 'code-block-copy-button'],
        ['hide the code block header', 'code-block-header'],
        ['hide the tab underline', 'tab-indicator'],
        ['hide the banner icon', 'banner-icon'],
        ['alerts without icons', 'banner-icon'],
      ])
        expect(first(await answer(q)), q).toEqual([
          `set t display none --on ${on}`,
        ]);
      // A whole part is the app's call: nothing is written.
      expect(first(await answer('no banners'))).toEqual([]);
      // A look taken away is that look.
      expect(first(await answer('cards without borders'))[0]).toMatch(
        /^set t border none --on card$/,
      );
    },
    T,
  );
});

describe('a display heading', () => {
  it(
    'sizes from the display size token',
    async () => {
      const lines = first(await answer('display heading 60px'));
      expect(lines).toContain(
        'set t font-size 60px --on heading --when type:display-1',
      );
      expect(lines).toContain('set t --text-display-1-size 60px');
    },
    T,
  );
});
