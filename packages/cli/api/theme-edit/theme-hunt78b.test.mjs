// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The answer check of `editor how`: a suggested command must make the
 * kind of change the words ask for (a color for a color ask, a radius for
 * a corner ask, …), move the way they say from the value there now, and
 * reach none or 0 for a removal. A command that does not is dropped and
 * the answer says plainly what it could not work out; never a wrong-way or
 * wrong-kind command.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
import {stepFits, thingFamily} from './_how-question.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

/**
 * @param {string[]} aspects
 * @param {Partial<{dir: 'more' | 'less' | null, zero: boolean, lighter: boolean | null, typed: string[], opacityDir: 'more' | 'less' | null}>} [more]
 */
const intent = (aspects, more = {}) => ({
  aspects,
  dir: null,
  zero: false,
  lighter: null,
  ...more,
});

describe('the answer check, step by step', () => {
  it.each(
    /** @type {Array<[string, {thing: string, value: string}, ReturnType<typeof intent>, string | null, boolean]>} */ ([
      // Wrong way, from wrong answers seen before.
      [
        'less line height on cards, own 1.2 → 1.3',
        {thing: 'line-height', value: '1.3'},
        intent(['leading'], {dir: 'less'}),
        '1.2',
        true, // line height is not one of the checked families
      ],
      [
        'half the border width, 3px → 2px is right',
        {thing: 'border-width', value: '2px'},
        intent(['border'], {dir: 'less'}),
        '3px',
        true,
      ],
      [
        'thinner border, 1px → 2px',
        {thing: 'border-width', value: '2px'},
        intent(['border'], {dir: 'less'}),
        '1px',
        false,
      ],
      [
        'more transparent, opacity 0.6 → 0.9',
        {thing: 'opacity', value: '0.9'},
        intent(['opacity'], {dir: 'more', opacityDir: 'less'}),
        '0.6',
        false,
      ],
      [
        'rounder cards, 12px → 8px',
        {thing: 'border-radius', value: '8px'},
        intent(['corners'], {dir: 'more'}),
        '12px',
        false,
      ],
      [
        'smaller text, 0.875rem → 1rem',
        {thing: 'font-size', value: '1rem'},
        intent(['fontsize'], {dir: 'less'}),
        '0.875rem',
        false,
      ],
      [
        'bolder, 600 → 400',
        {thing: 'font-weight', value: '400'},
        intent(['weight'], {dir: 'more'}),
        '600',
        false,
      ],
      [
        'lighter button background, #3366cc → black',
        {thing: 'background-color', value: '#000000'},
        intent(['background'], {lighter: true}),
        '#3366cc',
        false,
      ],
      // Removal.
      [
        'remove shadows, a shadow that is not none',
        {thing: 'box-shadow', value: '0 1px 2px #0003'},
        intent(['shadow'], {zero: true}),
        null,
        false,
      ],
      [
        'remove the corners, the dial word square',
        {thing: 'corners', value: 'square'},
        intent(['corners'], {zero: true}),
        null,
        true,
      ],
      // Wrong kind.
      [
        'a red border answered with a fill',
        {thing: 'padding', value: '8px'},
        intent(['border']),
        null,
        false,
      ],
      [
        'thicker focus outline answered with padding',
        {thing: 'padding', value: '4px'},
        intent(['border'], {dir: 'more'}),
        null,
        false,
      ],
      [
        'the badge text smaller answered with a radius',
        {thing: 'border-radius', value: '2px'},
        intent(['fontsize'], {dir: 'less'}),
        null,
        false,
      ],
      [
        'a typed value is as asked',
        {thing: 'background-color', value: '#dc2626'},
        intent(['background'], {lighter: false, typed: ['#dc2626']}),
        '#ff8888',
        true,
      ],
    ]),
  )('%s', (_name, step, want, now, ok) => {
    expect(stepFits(step, want, now).ok).toBe(ok);
  });

  it('knows the family of each property', () => {
    expect(thingFamily('border-top-left-radius')).toBe('radius');
    expect(thingFamily('--color-accent')).toBe('color');
    expect(thingFamily('padding-inline')).toBe('space');
    expect(thingFamily('--border-width')).toBe('border');
    expect(thingFamily('font-weight')).toBe('weight');
    expect(thingFamily('--shadow-high')).toBe('shadow');
    expect(thingFamily('--text-heading-2-size')).toBe('fontsize');
    expect(thingFamily('font-family')).toBeNull();
  });
});

/** @type {string} */
let cwd;

describe('the answer check in answers', () => {
  beforeAll(async () => {
    cwd = makeLinkedFixture('astryx-theme-hunt78b-', FIXTURE_PACKAGES);
    writeFixtureBaseTheme(cwd, 'neutral');
    await themeEditNew('q', {cwd, like: 'neutral'});
  }, 240_000);
  afterAll(() => removeLinkedFixture(cwd));

  /** Every set command in every answer. @param {string} q */
  const commands = async q => {
    const {data} = await themeEditHow(q, {cwd, theme: 'q'});
    return (data.results ?? [])
      .flatMap(r => r.commands)
      .filter(c => / editor set /.test(c))
      .map(c => c.replace(/^.* editor /, ''));
  };

  it.each(
    /** @type {Array<[string, RegExp]>} */ ([
      ['make the badge text all caps and smaller', /font-size .+ --on badge/],
      ['remove the top border on cards', /^set q border-top none --on card$/],
      ['remove shadows everywhere except dialogs', /box-shadow .+ --on dialog/],
      ['make the button background a bit lighter', /--on button/],
    ]),
  )(
    '%s still answers as asked',
    async (q, want) => {
      expect((await commands(q)).some(c => want.test(c))).toBe(true);
    },
    120_000,
  );

  it('no answer moves a corner or a text size the wrong way', async () => {
    /** @param {string} v */
    const px = v => {
      const m = /^'?(\d*\.?\d+)(px|rem)/.exec(v);
      return m ? Number(m[1]) * (m[2] === 'rem' ? 16 : 1) : null;
    };
    for (const [q, part, prop, now, dir] of /** @type {const} */ ([
      ['make the cards rounder', 'card', 'border-radius', 12, 1],
      ['make the cards sharper', 'card', 'border-radius', 12, -1],
      ['make the button text smaller', 'button', 'font-size', 14, -1],
    ])) {
      for (const c of await commands(q)) {
        const m = new RegExp(`^set q ${prop} (\\S+) --on ${part}`).exec(c);
        const v = m ? px(m[1]) : null;
        if (v != null) expect(Math.sign(v - now)).toBe(dir);
      }
    }
  }, 240_000);
});
