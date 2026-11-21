// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file An ask that starts with "clear the ..." and says only parts, their
 * mode or variant, and removable looks takes those looks away, as "remove"
 * does. Any other word in the ask, a way back included, leaves the reset
 * reading as before.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
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

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-how-clear-takes-', FIXTURE_PACKAGES);
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

const REMOVAL = /\b(?:border|box-shadow) none --on|transparent --on/;

describe('an ask that starts with "clear the ..."', () => {
  it('takes away the removable looks it names', async () => {
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
      'clear the borders on inputs',
      'cards: clear the border',
      'please clear the card shadow',
      'Clear the card border.',
      'clear the card shadow and make the text color white',
      'clear the card border and undo my heading edits',
      'make the text bigger\nclear the card shadow',
    ])
      expect(await commands(ask), ask).toMatch(REMOVAL);
  }, 300_000);

  it('reads as before when the ask says anything else', async () => {
    for (const ask of [
      // A property of the thing, a color or a value.
      'clear the card shadow and the border color',
      "clear the card's shadow and the card's border width",
      'clear the card border-color',
      'clear the card border 1.5px',
      'clear the card background to white',
      'clear the card background so it is white',
      'clear the button background to #ffffff',
      // Two looks: the clause reader puts the second in a clause of its own.
      "clear the card's border and shadow",
      // A way back, also in a next ask that points back at the look.
      'clear the card shadow and set it back to the default',
      'clear the card border and reset it',
      'clear the card background and restore it',
      'clear the card shadow and revert it to the base value',
      'clear the card shadow and undo it',
      'clear the card shadow and put it back',
      'clear the card shadow but keep it as the base theme has it',
      'clear the card shadow and restore the shadow',
      'clear the card shadow, back to the default',
      'clear the card shadow; back to the base value',
      'clear the card shadow, as before',
      'clear the card shadow to the default',
      'clear the card border back to the base value',
      'clear the card shadow from the last session',
      // The person's edits, or something someone made.
      'clear my card background changes',
      'clear the card overrides',
      'clear my changes to the border',
      'clear my background and border changes',
      'clear my card border tweaks',
      'clear my custom card shadow',
      'clear the added card border',
      'clear the border I added to cards',
      'clear the border my teammate added to cards',
      'clear the shadow added to cards',
      'clear the card border, I added it by mistake',
      'clear the shadow my theme adds to cards',
      // A clear that does not lead its ask, or names no determiner.
      'how do I clear the card shadow',
      'can you please clear the card shadow',
      'clear borders on cards',
      'give inputs a clear border',
      'cards with clear borders and shadows',
    ])
      expect(await commands(ask), ask).not.toMatch(REMOVAL);
  }, 600_000);

  it('takes away a look the theme sets; an ask for the edits still undoes them', async () => {
    await themeEditNew('rs', {cwd, like: 'neutral'});
    await themeEditSet('rs', 'background-color', '#fef3c7', {cwd, on: 'card'});
    /** @param {string} ask */
    const rs = async ask => {
      const {data} = /** @type {any} */ (
        await themeEditHow(ask, {cwd, theme: 'rs'})
      );
      return data.results
        .flatMap((/** @type {any} */ r) => r.commands)
        .join(' ;; ');
    };
    expect(await rs('clear the card background')).toContain(
      'set rs background-color transparent --on card',
    );
    expect(await rs('clear my card background changes')).toMatch(
      /\bundo rs background-color --on card\b/,
    );
  }, 300_000);
});
