// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A "clear" that leads a clause takes its reading from its own
 * object. With a removable thing as the object ("clear the dark mode card
 * background") it takes the thing away, as "remove" does. With the
 * person's edits, something someone made, or a way back as the object, and
 * wherever the parse is unsure, it reads as on main: a reset.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
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

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-how-clear-scope-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('ne', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} ask */
const commands = async ask => {
  const {data} = /** @type {any} */ (
    await themeEditHow(ask, {cwd, theme: 'ne'})
  );
  return /** @type {Array<{commands: string[]}>} */ (data.results ?? [])
    .flatMap(r => r.commands)
    .map(c => c.replace(/^.*? editor /, ''))
    .join(' ;; ');
};

const REMOVAL = /(?:border|box-shadow) none --on card|transparent --on card/;

describe('a clause-leading clear', () => {
  it('takes away the removable thing it names', async () => {
    expect(await commands('clear the dark mode card background')).toContain(
      'set ne background-color transparent --on card --mode dark',
    );
    expect(
      await commands('clear the dark mode secondary button background'),
    ).toContain(
      'set ne background-color transparent --on button --when variant:secondary --mode dark',
    );
    for (const ask of [
      'clear the card border',
      "clear the card's shadow",
      'clear the default card shadow',
      'clear the shadow used on cards',
      'clear the card background so the page color shows through',
    ])
      expect(await commands(ask), ask).toMatch(REMOVAL);
  }, 240_000);

  it('ends at an and that starts another ask, a line break or a list marker', async () => {
    for (const ask of [
      'clear the card shadow and make the text color white',
      'clear the card border and undo my heading edits',
      'clear the card shadow and keep the text dark',
      'clear the card shadow and let the page show',
      'cards: clear the border',
      '- clear the card shadow',
      'make the text bigger\nclear the card shadow',
    ])
      expect(await commands(ask), ask).toMatch(REMOVAL);
  }, 240_000);

  it('reads as on main for edits, what someone made, a way back, or no object', async () => {
    for (const ask of [
      'clear my card background changes',
      'clear the card overrides',
      'clear my changes to the border',
      'clear my background and border changes',
      'clear my card border tweaks',
      'clear my modifications to the card border',
      'clear my customizations to the card shadow',
      'clear the card border color',
      'clear the border I added to cards',
      'clear the border we added to cards',
      'clear the shadow I put on cards',
      'clear the shadow added to cards',
      "clear the card shadow I've added",
      'clear the border I just added to cards',
      'clear the border my teammate added to cards',
      'clear the border put on cards',
      'clear the card shadow I applied',
      'clear the card border back to the base value',
      'how do I clear the card shadow',
      'clear borders on cards',
      'give inputs a clear border',
      'links should have a clear underline',
      'cards with clear borders and shadows',
    ])
      expect(await commands(ask), ask).not.toMatch(
        /(?:border|box-shadow|text-decoration) none|transparent --on/,
      );
  }, 600_000);
});
