// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how`: the error banner's text weight is set
 * under its status; a part kept to a place (said as "the dialog buttons"
 * or "menu items in the dialog") writes nothing unless a token on the
 * place holds it; a size named moves that size's own control height, or
 * nothing when the part data shows none; an icon's size is said, never the
 * button's.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

/** @type {string} */
let cwd;
/** Why a bundled base could not be installed here, when one could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-how-error-banner-text-weight-',
    FIXTURE_PACKAGES,
  );
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('n', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string} q */
const answer = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'n'});
  const results = data.results ?? [];
  const sets = (/** @type {string[]} */ cs) =>
    cs
      .filter(c => / editor set /.test(c))
      .map(c => c.replace(/^.* editor set \S+ /, ''));
  return {
    first: sets(
      results.find(r => r.commands.some(c => / editor set /.test(c)))
        ?.commands ?? [],
    ),
    all: sets(results.flatMap(r => r.commands)),
    text: results.map(r => r.text).join('\n'),
  };
};

/** @param {import('vitest').TestContext} test */
const needsBases = test => {
  if (unbuilt) {
    console.warn(`skipped: ${unbuilt}`);
    test.skip();
  }
};

const T = 300_000;

describe('how error banner text weight', () => {
  it(
    "the error banner's text weight is set under its status",
    async test => {
      needsBases(test);
      const r = await answer("make the error banner's text bold");
      expect(r.first.length).toBeGreaterThan(0);
      for (const c of r.first) expect(c).toMatch(/--when status:error/);
    },
    T,
  );
  it.each([
    'make the dialog buttons red',
    'make the menu items in the dialog red',
    'make the tabs in the card bigger',
  ])(
    '%s: nothing written, the reason said',
    async (q, test) => {
      needsBases(test);
      const r = await answer(q);
      expect(r.all, q).toEqual([]);
      expect(r.text, q).toMatch(/cannot be kept apart|cannot keep/);
    },
    T,
  );
  it(
    'a token the place holds still answers',
    async test => {
      needsBases(test);
      expect((await answer('make the card links red')).first).toEqual([
        "--color-text-accent '#dc2626' --on card",
      ]);
    },
    T,
  );
  it(
    'a size named: its own control height, or nothing',
    async test => {
      needsBases(test);
      expect((await answer('make the medium buttons 36px tall')).first).toEqual(
        ['--size-element-md 36px --on button'],
      );
      const lg = await answer('make the large buttons 4px taller');
      expect(lg.all).toEqual([]);
      expect(lg.text).toMatch(/lg size reads no control height/);
    },
    T,
  );
  it(
    'border widths keep each state, inputs shrink, sizes step',
    async test => {
      needsBases(test);
      for (const q of [
        'make the radio border thicker',
        'make the checkbox border thicker',
      ])
        for (const c of (await answer(q)).all)
          expect(c, q).not.toMatch(/^border /);
      expect((await answer('make the inputs 24px tall')).first).toEqual([
        '--size-element-md 24px --on inputs',
        '--size-element-sm 20px --on inputs',
      ]);
      expect((await answer('make the small buttons taller')).first).toEqual([
        '--size-element-sm 32px --on button',
      ]);
      expect((await answer('make the medium buttons taller')).first).toEqual([
        '--size-element-md 36px --on button',
      ]);
      const sel = (await answer('make the selectors 4px taller')).first;
      expect(sel.map(c => c.split(' ').slice(0, 2).join(' '))).toEqual([
        '--size-element-md 36px',
        '--size-element-sm 32px',
      ]);
      const inCards = await answer('make the inputs in cards rounder');
      expect(inCards.all).toEqual([]);
      expect(inCards.text).toMatch(/cannot be kept apart|cannot keep/);
    },
    T,
  );
  it.each(['make the button icon bigger', 'make the icon in buttons bigger'])(
    '%s: the icon size is said, the button untouched',
    async (q, test) => {
      needsBases(test);
      const r = await answer(q);
      expect(r.all, q).toEqual([]);
      expect(r.text, q).toMatch(/icon's size/);
    },
    T,
  );
});
