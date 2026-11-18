// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A paint an element inside a part draws from a token (a list item's label
 * text): set never takes the property on the part, which that element
 * paints over, and offers the token. A paint drawn by a part of its own (a
 * keyboard key's badge, a calendar's range band) is no such paint: a fill on
 * the group around it is taken. Against real bundled base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-inner-paint-', FIXTURE_PACKAGES);
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

/** @param {string} q @param {string} theme */
const answer = async (q, theme) => {
  const {data} = await themeEditHow(q, {cwd, theme});
  return {
    parts: data.understood?.parts ?? [],
    writes: (data.results ?? [])
      .flatMap((/** @type {any} */ r) => r.commands)
      .filter((/** @type {string} */ c) => / editor set /.test(c))
      .map((/** @type {string} */ c) => c.replace(/^.*? editor /, '')),
    text: (data.results ?? []).map((/** @type {any} */ r) => r.text).join('\n'),
  };
};

describe('a paint drawn inside a part', () => {
  it('refuses the property on the part and offers the token, and takes a fill on a group whose inner paints are parts of their own', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('i', {cwd, like: 'neutral'});
    // Kbd's key badges paint each key's fill as a part of their own,
    // kbd-key, which takes the property. Now that the badges, and a
    // calendar's range band, are parts of their own, a fill on the group
    // around them (kbd, calendar) is no longer painted over, so it is taken
    // and paints the group's own box; so is one on a part whose inner parts
    // paint their own (a paragraph's code).
    await themeEditSet('i', 'background-color', '#888888', {
      cwd,
      on: 'kbd-key',
    });
    await themeEditSet('i', 'background-color', '#999999', {cwd, on: 'kbd'});
    await themeEditSet('i', 'background-color', '#f5f5f5', {
      cwd,
      on: 'markdown-paragraph',
    });
    await themeEditSet('i', 'background-color', '#fafafa', {
      cwd,
      on: 'calendar',
    });
    const item = await refusal(() =>
      themeEditSet('i', 'color', '#ff0000', {cwd, on: 'radio-list-item'}),
    );
    expect(item.code).toBe('ERR_THEME_NO_EFFECT');
    expect(item.run[0]).toMatch(
      /--color-text-primary '#ff0000' --on radio-list-item$/,
    );
    // (A part that paints its own fill keeps the property.)
    await themeEditSet('i', 'background-color', '#888888', {cwd, on: 'card'});
    // The words for a keyboard key or shortcut read Kbd, as before. Kbd
    // draws no fill of its own: its key badges do, so a fill or color asked
    // of it is handed to kbd-key, and the answer names it.
    for (const q of [
      'make the keyboard keys gray',
      'make the keyboard shortcut gray',
      'make the kbd gray',
      'make the key chips gray',
      'make the shortcut keys gray',
      'make the keyboard shortcut blue',
    ]) {
      const keys = await answer(q, 'i');
      expect(keys.writes.join('\n'), q).toMatch(
        / background-color '(?:#[0-9a-f]{6}|light-dark\(#[0-9a-f]{6}, #[0-9a-f]{6}\))' --on kbd-key$/m,
      );
      expect(keys.text, q).toMatch(
        /kbd draws no fill of its own: the kbd-key inside it draws it/,
      );
    }
    // A part holding several parts that draw it writes nothing and names
    // them.
    // A piece whose resting look is keyed by its own visual props (a
    // slider's track by orientation) draws at rest: a slider holds two
    // such pieces, so nothing is written and the answer names them.
    for (const [q, named] of [
      [
        'make the stepper gray',
        /stepper draws no fill of its own; the parts inside it that draw it: .*step-bar/,
      ],
      [
        'make the slider gray',
        /slider draws no fill of its own; the parts inside it that draw it: .*slider-track/,
      ],
    ]) {
      const several = await answer(q, 'i');
      expect(several.writes, q).toEqual([]);
      expect(several.text, q).toMatch(named);
    }
    // A shared component inside a part (an empty state's or a button
    // group's Button) is never handed the change: main's answer stands.
    for (const q of [
      'make the empty state gray',
      'make the button group gray',
      'make the overflow list gray',
      // (Nor a piece that fills only to mark a state: a nav item's
      // selected fill, an option's highlight.)
      'make the top nav gray',
      'make the typeahead dropdown gray',
      'make the command palette list gray',
      'make the tree list gray',
      'make the nav heading menu gray',
      // (Nor one whose fill is only a hover or press layer inside it.)
      'make the tab list gray',
      'make the radio list gray',
    ]) {
      const shared = await answer(q, 'i');
      expect(shared.writes.join('\n'), q).not.toMatch(
        / --on (button|top-nav-item|typeahead-option|command-palette-item|tree-list-item|nav-heading-menu-item|tab|radio-list-item)\b/,
      );
    }
    // The space between the keys is Kbd's own gap, as the room between the
    // parts any holder lays out side by side is that holder's (a
    // tokenizer's tokens, a stepper's steps).
    for (const [q, on] of [
      ['make the gap in the keyboard shortcut bigger', 'kbd'],
      ['Make the keyboard shortcut gap bigger', 'kbd'],
      ['make the kbd gap 8px', 'kbd'],
      ['more space between the keys in the keyboard shortcut', 'kbd'],
      ['less space between the keys of the keyboard shortcut', 'kbd'],
      ['more space between the key caps in the kbd', 'kbd'],
      ["more space between the keyboard shortcut's keys", 'kbd'],
      ['more space between the tokens in the tokenizer', 'tokenizer'],
      ['more space between the steps in the stepper', 'stepper'],
    ]) {
      const gap = await answer(q, 'i');
      expect(gap.writes.join('\n'), q).toMatch(new RegExp(` --on ${on}\\b`));
      expect(gap.writes.join('\n'), q).not.toMatch(
        / --on (kbd-key|token|step)\b/,
      );
    }
    const badges = await answer('make the key badges gray', 'i');
    expect(badges.writes.join('\n')).toMatch(/ --on kbd-key\b/);
    const text = await answer('make the radio list item text red', 'i');
    expect(text.writes.join('\n')).not.toMatch(
      / color '#dc2626' --on radio-list-item/,
    );
  }, 240_000);
});
