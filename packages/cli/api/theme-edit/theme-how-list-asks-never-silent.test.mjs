// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` on a long ask: a palette color said as a look ("a cool
 * slate palette") reaches the neutral dial though other clauses name parts;
 * "light and dark" said as a clause of its own is the theme's two modes;
 * and in a list of three asks or more, a word no setting reads ("fast") is
 * named though the list names parts.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

/** @type {string} */
let cwd;
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-how-list-asks-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('n', {cwd, like: 'neutral'});
  await themeEditNew('l', {cwd, like: 'neutral'});
  await themeEditSet('l', 'mode', 'light-only', {cwd});
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string} q @param {string} [theme] */
const answer = async (q, theme = 'n') => {
  const {data} = /** @type {any} */ (await themeEditHow(q, {cwd, theme}));
  const drafts = /** @type {Array<{text: string, commands?: string[]}>} */ (
    data.results ?? []
  );
  return {
    texts: drafts.map(d => d.text),
    commands: drafts.flatMap(d => d.commands ?? []),
  };
};

const DASHBOARD =
  'Theme our logistics control room dashboard: dense data tables, a cool slate palette, electric blue accent, clear red/amber/green statuses that also work for color-blind operators, 13px text, light and dark.';

describe('a long ask', () => {
  it('reads a palette color said as a look as the neutral, beside parts', async () => {
    if (unbuilt) return;
    const {commands} = await answer(DASHBOARD);
    expect(commands.some(c => / set n neutral '#64748b'$/.test(c))).toBe(true);
  }, 300_000);

  it('reads "light and dark" as the two modes', async () => {
    if (unbuilt) return;
    expect(
      (await answer(DASHBOARD)).texts.some(t =>
        /^n has a dark mode already\b/.test(t),
      ),
    ).toBe(true);
    const light = await answer('13px text, light and dark', 'l');
    expect(light.commands.some(c => / set l mode both$/.test(c))).toBe(true);
  }, 300_000);

  it('names a word no setting reads in a list that names parts', async () => {
    if (unbuilt) return;
    const {texts} = await answer(
      'page loud and fast: black background, sharp square corners, heavy condensed headings',
    );
    expect(
      texts.some(t => /^not taken: .*"fast"/.test(t)),
      texts.join('\n'),
    ).toBe(true);
  }, 300_000);

  it('adds no word to a plain list of part asks', async () => {
    if (unbuilt) return;
    const {texts} = await answer(
      'rounded cards, bold headings and a blue accent',
    );
    expect(texts.filter(t => /^not (?:taken|used):/.test(t))).toEqual([]);
  }, 300_000);
});
