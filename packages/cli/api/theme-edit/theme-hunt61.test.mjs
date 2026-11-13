// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file hunt61: how keeps a request's scope (`--on`), its state
 * (`--state`) and an exact amount ("half", "double", "50%") worked out from
 * the theme's own value, never a stock value or a whole-theme change.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {exactFactor} from './_how-question.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt61-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('q', {cwd, like: 'neutral'});
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** The first change how gives, without the CLI prefix. @param {string} q */
const top = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'q'});
  const r = (data.results ?? []).find(x =>
    x.commands.some(c => / editor (set|undo) /.test(c)),
  );
  return {
    command: (r?.commands[0] ?? '').replace(/^.* editor /, ''),
    text: r?.text ?? '',
  };
};

describe('hunt61: scope, state and amount', () => {
  it.each(
    /** @type {Array<[string, RegExp]>} */ ([
      // vibe batch 2: the request that removed every focus ring.
      [
        'focus ring on inputs only, at half strength',
        /^set q --focus-outline-width 1px --on inputs$/,
      ],
      [
        'thinner focus ring on buttons',
        /^set q --focus-outline-width 1px --on button$/,
      ],
      [
        'focus ring on buttons at double strength',
        /^set q --focus-outline-width 4px --on button$/,
      ],
      [
        'focus ring 50% strength on buttons',
        /^set q --focus-outline-width 1px --on button$/,
      ],
      [
        'focus ring color red on inputs only',
        /^set q --focus-outline-color '#dc2626' --on inputs$/,
      ],
      [
        'remove the focus ring on cards',
        /^set q --focus-outline-width 0px --on card$/,
      ],
      [
        'selected tabs bold',
        /^set q font-weight 700 --on tab --state selected$/,
      ],
      [
        'bold text on hover for links',
        /^set q font-weight 700 --on link --state hover$/,
      ],
      ['buttons only, a bit rounder', /^set q corners more --on button$/],
    ]),
  )(
    '%s',
    async (q, want) => {
      expect((await top(q)).command).toMatch(want);
    },
    120_000,
  );

  it.each(
    /** @type {Array<[string, string, number]>} */ ([
      ['half the corner radius on buttons', 'button', 0.5],
      ['double the corner radius on cards', 'card', 2],
    ]),
  )(
    '%s: from the radius the part has now',
    async (q, part, factor) => {
      const r = await top(q);
      const m = new RegExp(
        `^set q border-radius (\\d*\\.?\\d+)(px|rem) --on ${part}$`,
      ).exec(r.command);
      const now = /\(now (\d*\.?\d+)(px|rem)\)/.exec(r.text);
      expect(m && now).toBeTruthy();
      const px = (/** @type {string} */ n, /** @type {string} */ u) =>
        u === 'rem' ? Number(n) * 16 : Number(n);
      expect(
        px(/** @type {any} */ (m)[1], /** @type {any} */ (m)[2]),
      ).toBeCloseTo(
        px(/** @type {any} */ (now)[1], /** @type {any} */ (now)[2]) * factor,
        0,
      );
    },
    120_000,
  );

  it('names the value it starts from and how it read "strength"', async () => {
    const r = await top('focus ring on inputs only, at half strength');
    expect(r.text).toContain('(now 2px)');
    expect(r.text).toContain('"strength" read as the width of the ring');
  }, 120_000);

  it('reads exact amounts', () => {
    expect(exactFactor('at half strength')).toBe(0.5);
    expect(exactFactor('double the padding')).toBe(2);
    expect(exactFactor('twice as wide')).toBe(2);
    expect(exactFactor('at 75% strength')).toBe(0.75);
    expect(exactFactor('a bit rounder')).toBeNull();
  });
});

describe('hunt61b: headers and titles', () => {
  it.each(
    /** @type {Array<[string, RegExp]>} */ ([
      // A text word: the headings' type, and "just" keeps that scope.
      ['just the headers bolder', /^set q headings bold$/],
      ['make the titles bigger', /^set q type /],
      ['header font serif', /^set q font serif --on heading$/],
      // A surface word: the app header part.
      [
        'header background dark',
        /^set q background '#[0-9a-f]{6}' --on app-shell-header$/,
      ],
      ['the header bar border thicker', / --on app-shell-header$/],
      // The clause starts after the last break: a full stop or semicolon too.
      [
        'make the body text bigger. header background dark',
        /^set q text-size more$/,
      ],
      // A part that owns its header keeps it.
      [
        'table header text bold',
        /^set q font-weight 700 --on table-header-cell$/,
      ],
    ]),
  )(
    '%s',
    async (q, want) => {
      expect((await top(q)).command).toMatch(want);
    },
    120_000,
  );
});

describe('hunt61c: clause breaks and comparisons', () => {
  it('a header after a full stop is the app header part', async () => {
    const {data} = await themeEditHow(
      'make the body text bigger. header background dark',
      {cwd, theme: 'q'},
    );
    const all = (data.results ?? []).flatMap(r => r.commands).join('\n');
    expect(all).toMatch(/background '#[0-9a-f]{6}' --on app-shell-header/);
    expect(all).not.toMatch(/--on heading\b/);
  }, 120_000);

  it('"cards with twice the padding of buttons" measures against buttons', async () => {
    // No padding of the theme's own on buttons: twice the padding a button
    // has now (the token it reads, hunt63), on cards.
    const step = await top('cards with twice the padding of buttons');
    // Each side of the button's padding.
    expect(step.command).toMatch(/^set q padding ('[^']+'|\S+) --on card$/);
    expect(step.text).toMatch(/\(button has [^)]+\)/);
    // With one: twice that, on cards only.
    await themeEditSet('q', 'padding', '10px', {cwd, on: 'button'});
    const exact = await top('cards with twice the padding of buttons');
    expect(exact.command).toBe('set q padding 20px --on card');
    expect(exact.text).toContain('(button has 10px)');
  }, 240_000);
});
