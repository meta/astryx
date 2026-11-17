// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how`: a feel word said for the whole theme ("playful",
 * "minimal", "cinematic") moves the dials whose own help gives that feel,
 * and each line says what it read. Words no help gives are named as not
 * taken. A dial the ask sets itself keeps its value, and a feel word said
 * of a part or of one thing ("playful buttons", "soft shadows") is that
 * one's. The feels come only from the dials' help, which `how <dial>`
 * shows.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {FEELS, DIALS} from './_tables.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-how-feel-words-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('n', {cwd, like: 'neutral'});
  await themeEditSet('n', 'accent', '#2563eb', {cwd});
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string} q */
const answer = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'n'});
  const results = data.results ?? [];
  return {
    text: results.map(r => r.text).join('\n'),
    sets: results
      .flatMap(r => r.commands)
      .filter(c => / editor set /.test(c))
      .flatMap(c => c.split(' && '))
      .map(c => c.replace(/^.* editor set \S+ /, '')),
  };
};

describe('the feels the dials help gives', () => {
  it("come from each dial's help text, as `how <dial>` shows it", () => {
    for (const [w, moves] of FEELS)
      for (const m of moves)
        expect(DIALS[m.dial].help).toMatch(
          new RegExp(`Feel: [^.]*\\b${m.value} feels [^;.]*\\b${w}\\b`),
        );
    expect(FEELS.get('playful')).toEqual([
      {dial: 'corners', value: 'round'},
      {dial: 'vibrancy', value: 'more'},
    ]);
  });
});

describe('a feel word said for the whole theme', () => {
  it('"playful minimal recipe site" moves the dials and says what it read', async ctx => {
    if (unbuilt) return ctx.skip();
    const a = await answer('playful minimal recipe site');
    expect(a.sets).toEqual(
      expect.arrayContaining([
        'corners round',
        'vibrancy more',
        'spacing roomy',
        'surfaces flat',
      ]),
    );
    expect(a.text).toMatch(/playful → corners round/);
    expect(a.text).toMatch(/minimal → surfaces flat/);
    expect(a.text).toMatch(/not taken: "recipe"/);
  }, 240_000);

  it('"a cinematic travel journal" reads cinematic and names the rest', async ctx => {
    if (unbuilt) return ctx.skip();
    const a = await answer('a cinematic travel journal');
    expect(a.sets).toContain('type display');
    expect(a.text).toMatch(/not taken: "travel", "journal"/);
  }, 240_000);

  it('never overrides a value the ask gives: "playful theme with square corners"', async ctx => {
    if (unbuilt) return ctx.skip();
    const a = await answer('playful theme with square corners');
    expect(a.sets).toContain('corners square');
    expect(a.sets).not.toContain('corners round');
    expect(a.text).not.toMatch(/not used: "playful theme"/);
  }, 240_000);

  it('"feels too playful" moves away from the feel, never toward it', async ctx => {
    if (unbuilt) return ctx.skip();
    expect((await answer('it feels too playful now')).sets).toEqual([]);
  }, 240_000);

  it("said of a part or of one thing, it is that one's", async ctx => {
    if (unbuilt) return ctx.skip();
    expect((await answer('playful buttons')).sets).not.toContain(
      'corners round',
    );
    expect((await answer('make the shadows minimal')).sets).not.toContain(
      'spacing roomy',
    );
  }, 240_000);
});
