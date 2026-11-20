// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A part kept to its container: a token the part reads, set on the
 * container, keeps it there; a part's own setting would reach every one, so
 * nothing is written. Against real bundled base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

/** Why a bundled theme could not be built here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-scoped-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {import('vitest').TestContext} ctx */
const needBases = ctx => {
  if (!unbuilt) return false;
  console.warn(`skipped: ${unbuilt}`);
  ctx.skip();
  return true;
};

/** The first answer's commands, bare. @param {string} q @param {string} theme */
const top = async (q, theme) => {
  const {data} = await themeEditHow(q, {cwd, theme});
  const r = (data.results ?? []).find(x =>
    x.commands.some(c => / editor (set|undo) /.test(c)),
  );
  return {
    text: (data.results ?? []).map(x => x.text).join('\n'),
    commands: (r?.commands ?? []).map(c => c.replace(/^.*? editor /, '')),
  };
};

/** @param {string} q @param {string} theme */
const nothing = async (q, theme) => {
  const {data} = await themeEditHow(q, {cwd, theme});
  return {
    writes: (data.results ?? [])
      .flatMap((/** @type {any} */ r) => r.commands)
      .filter((/** @type {string} */ c) => / editor (set|undo) /.test(c)),
    text: (data.results ?? []).map((/** @type {any} */ r) => r.text).join('\n'),
  };
};

describe('a part kept to its container', () => {
  it('writes nothing for a part property the container cannot hold, and says why', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('n', {cwd, like: 'neutral'});
    for (const q of [
      'make buttons inside cards red',
      'make buttons inside cards smaller',
      "make the button groups' dividers red",
      "make the tabs' divider blue",
      'make the header in cards gray',
    ]) {
      const r = await nothing(q, 'n');
      expect(r.writes, q).toEqual([]);
      expect(r.text, q).toMatch(/nothing is written/);
    }
    // (The card's title, a heading in it: a weight is the heading's own.)
    const title = await nothing('make card titles red', 'n');
    expect(title.writes).toEqual([]);
    expect(title.text).toMatch(/no card title part of its own/);
  }, 240_000);

  it('sets the tokens the part reads on the container', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('t', {cwd, like: 'neutral'});
    for (const q of [
      'make the headings in cards bigger',
      'make the card title bigger',
    ]) {
      const r = await top(q, 't');
      expect(r.commands.length, q).toBeGreaterThan(0);
      for (const c of r.commands)
        expect(c, q).toMatch(/^set t --text-heading-\S+-size \S+ --on card$/);
    }
    // (A sheet's title is a heading in it: its sizes, on the sheet.)
    for (const c of (await top('make sheet titles bigger', 't')).commands)
      expect(c).toMatch(
        /^set t --text-heading-\S+-size \S+ --on (?:bottom-)?sheet$/,
      );
    expect(
      (await top("make today's date in the calendar bold", 't')).commands,
    ).toEqual(['set t font-weight 700 --on calendar-day --state today']);
    expect((await top('make links on cards red', 't')).commands).toEqual([
      "set t --color-text-accent '#dc2626' --on card",
    ]);
    const icons = await top('make icons in buttons red', 't');
    expect(icons.commands.every(x => / --on button$/.test(x))).toBe(true);
    expect(icons.commands.join(' ')).toMatch(/--color-icon-primary/);
  }, 240_000);
});
