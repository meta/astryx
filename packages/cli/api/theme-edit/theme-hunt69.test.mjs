// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The sixty-ninth pass over `astryx experimental theme editor how`
 * one amount parser for every way an amount is said,
 * never read as a length or with a second dial step; fractional pixels
 * kept; a part's line height and opacity scaled the right way; whole-theme
 * radius and border width amounts exact; a width amount with no width says
 * so; own side paddings kept; px moves keep their state and variant.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {exactFactor} from './_how-question.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt69-', FIXTURE_PACKAGES);
  await themeEditNew('t', {cwd});
  await themeEditNew('s', {cwd});
  for (const [
    thing,
    value,
    flags,
  ] of /** @type {Array<[string, string, any]>} */ ([
    ['padding', '12px', {on: 'card'}],
    ['line-height', '1.2', {on: 'card'}],
    ['opacity', '0.8', {on: 'card'}],
    ['border-width', '1px', {on: 'button'}],
    ['font-size', '15px', {on: 'badge'}],
    ['letter-spacing', '1px', {on: 'badge'}],
    ['border-radius', '8px', {on: 'button', state: 'hover'}],
    ['--border-width', '3px', {}],
  ]))
    await themeEditSet('t', thing, value, {cwd, ...flags});
  await themeEditSet('s', 'padding-inline', '20px', {cwd, on: 'card'});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} q @param {string} [theme] */
const how = async (q, theme = 't') =>
  JSON.stringify(/** @type {any} */ (await themeEditHow(q, {cwd, theme})).data);

describe('hunt69: how amounts', () => {
  it.each([
    ['a quarter bigger', 1.25],
    ['half again as big', 1.5],
    ['2x', 2],
    ['0.5x', 0.5],
    ['quadruple', 4],
    ['x0', 0],
    ['4 times', 4],
    ['11 times bigger', 11],
    ['100% smaller', 0],
    ['scale by 1.5', 1.5],
    ['by a factor of 2', 2],
    ['×2', 2],
    ['½ the padding', 0.5],
    ['50 percent bigger', 1.5],
    ['+50%', 1.5],
    ['-25%', 0.75],
    ['cut it by a third', 2 / 3],
  ])('exactFactor(%s) = %s', (words, f) => {
    expect(exactFactor(words)).toBeCloseTo(f, 5);
  });

  it('an amount is never a length, and no second dial step', async () => {
    for (const [q, want] of [
      ['make card padding 4 times', /set t padding 48px --on card/],
      ['card padding 2× bigger', /set t padding 24px --on card/],
      [
        'make the card padding 50 percent bigger',
        /set t padding 18px --on card/,
      ],
      ['make card padding 3 times bigger', /set t padding 36px --on card/],
    ]) {
      const out = await how(String(q));
      expect(out, String(q)).toMatch(/** @type {RegExp} */ (want));
      expect(out, String(q)).not.toMatch(/spacing more|min-height|height 2px/);
    }
  }, 240_000);

  it('fractional pixels are kept', async () => {
    expect(await how('half the border width on buttons')).toMatch(
      /border-width 0\.5px --on button/,
    );
    expect(await how('half the font size on badges')).toMatch(
      /font-size 7\.5px --on badge/,
    );
    expect(await how('a third of the letter spacing on badges')).toMatch(
      /letter-spacing 0\.33px --on badge/,
    );
  }, 240_000);

  it('a part line height goes the asked way, by the asked factor', async () => {
    expect(await how('less line height on cards')).toMatch(
      /line-height 1\.08 --on card/,
    );
    expect(await how('make line height on cards 150%')).toMatch(
      /line-height 1\.8 --on card/,
    );
    expect(await how('make line height on cards 1.5x')).toMatch(
      /line-height 1\.8 --on card/,
    );
  }, 240_000);

  it('whole-theme radius amounts are exact token values; steps say so', async () => {
    const out = await how('double --radius-element');
    expect(out).toMatch(/set t --radius-element \d/);
    expect(out).not.toMatch(/corners more/);
    expect(await how('make everything 20% roomier')).toMatch(
      /one step, not the exact amount asked/,
    );
  }, 240_000);

  it('more transparent lowers the opacity and leaves the fill', async () => {
    const out = await how('make cards 50% more transparent');
    expect(out).toMatch(/set t opacity 0\.4 --on card/);
    expect(out).not.toMatch(/background transparent/);
  }, 240_000);

  it('a width amount with no width says so, never a 720px cap', async () => {
    const out = await how('make menus 20% wider');
    expect(out).toMatch(/no width of its own to scale/);
    expect(out).not.toMatch(/720px/);
  }, 240_000);

  it('an own side padding is scaled with the rest', async () => {
    expect(await how('double the card padding', 's')).toMatch(
      /set s padding '\S+ 40px' --on card/,
    );
  }, 240_000);

  it('a px move keeps the state and starts from its value', async () => {
    expect(await how('make button corners 2px rounder on hover')).toMatch(
      /set t border-radius 10px --on button --state hover/,
    );
    expect(await how('make primary buttons 2px rounder')).toMatch(
      /--on button --when variant:primary/,
    );
  }, 240_000);

  it('whole-theme border width amounts scale the token', async () => {
    expect(await how('double the border width everywhere')).toMatch(
      /set t --border-width 6px/,
    );
    expect(await how('half the border width everywhere')).toMatch(
      /set t --border-width 1\.5px/,
    );
  }, 240_000);

  it('a corner percent with an amount is an exact length, never a % radius', async () => {
    for (const q of [
      'card corners 50% of now',
      'card corners 50% smaller',
      'card corners 20% bigger',
    ]) {
      const out = await how(q, 's');
      expect(out, q).toMatch(/set s border-radius \d/);
      expect(out, q).not.toMatch(/border-radius '?\d+%|spacing (more|less)/);
    }
  }, 240_000);

  it('a corner amount with no radius to read says it is a step', async () => {
    expect(await how('halve the corner radius on the popover', 's')).toMatch(
      /one step, not an exact amount/,
    );
  }, 240_000);

  it('zero words remove the asked thing, on the asked state', async () => {
    expect(await how('no inner spacing on cards', 's')).toMatch(
      /set s padding 0px --on card/,
    );
    expect(await how('zero padding on cards', 's')).toMatch(
      /set s padding 0px --on card/,
    );
    expect(await how('no gap on cards', 's')).toMatch(
      /set s gap 0px --on card/,
    );
    expect(
      await how('no inner spacing on text-input when disabled', 's'),
    ).toMatch(/padding 0px --on text-input --state disabled/);
    // A group member named in words is that member.
    expect(await how('more padding on text inputs on hover', 's')).toMatch(
      /--on text-input --state hover/,
    );
  }, 240_000);

  it('font size and line height amounts on parts with no size of their own', async () => {
    expect(await how('double the font size on avatars', 's')).toMatch(
      /set s font-size \S+ --on avatar/,
    );
    expect(await how('double the line height on cards', 's')).toMatch(
      /line-height [2-9]/,
    );
  }, 240_000);
});
