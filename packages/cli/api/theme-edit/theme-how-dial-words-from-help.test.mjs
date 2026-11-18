// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` reads a look's words from the dials themselves. A
 * feel word said of a part the dial's own help names ("elegant serif
 * headings": the type dial's help names headings) moves that dial too. A
 * rung of the text-size dial said for the text ("large readable text") is
 * that rung, never one step. A color word that names the theme's own color
 * ("navy" in a theme with a navy accent) takes that color's own shade. The
 * words no setting reads are named beside the list of the dials, made
 * from the dials themselves.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {DIALS} from './_tables.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-how-dial-words-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('n', {cwd, like: 'neutral'});
  await themeEditSet('n', 'accent', '#1e3a5f', {cwd});
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

describe('words read from the dials', () => {
  it('"elegant serif headings" sets serif headings and the type the dial help gives elegant', async ctx => {
    if (unbuilt) return ctx.skip();
    const a = await answer('elegant serif headings');
    expect(a.sets).toContain('font serif --on heading');
    expect(a.sets).toContain('type editorial');
    expect(a.text).not.toMatch(/not taken: "elegant"/);
  }, 240_000);

  it('"large readable text" is the text-size dial at large; "larger text" one step', async ctx => {
    if (unbuilt) return ctx.skip();
    expect((await answer('large readable text')).sets).toContain(
      'text-size large',
    );
    expect((await answer('make the text larger')).sets).toContain(
      'text-size more',
    );
  }, 240_000);

  it('"navy buttons" takes the shade of the theme\'s own navy accent', async ctx => {
    if (unbuilt) return ctx.skip();
    const line = (await answer('navy buttons')).sets.find(l =>
      /--on button/.test(l),
    );
    expect(line).toBeTruthy();
    expect(line).not.toContain('#1e3a8a');
  }, 240_000);

  it('the words no setting reads are named beside every dial', async ctx => {
    if (unbuilt) return ctx.skip();
    const a = await answer('a playful minimal quizzical theme');
    const named = /not taken: [^\n]*/.exec(a.text)?.[0] ?? '';
    expect(named).toMatch(/"quizzical"/);
    for (const dial of Object.keys(DIALS)) expect(named).toContain(dial);
  }, 240_000);

  it('a color of the accent\'s hue but far from it keeps its own value and mode: "a warm brown page in dark mode"', async ctx => {
    if (unbuilt) return ctx.skip();
    await themeEditSet('n', 'accent', '#ea580c', {cwd});
    const lines = (await answer('dark mode with a warm brown page')).sets;
    const body = lines.find(l => /^--color-background-body /.test(l));
    expect(body).toMatch(/--mode dark$/);
    expect(body).not.toMatch(/light-dark/);
    await themeEditSet('n', 'accent', '#1e3a5f', {cwd});
  }, 240_000);
});
