// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A gradient written for a variant, a state or a mode is built as the
 * background longhands its value gives, never the background shorthand, so
 * a background longhand set on the whole part (its repeat, its size) still
 * applies there: a hover gradient on a button whose background is set not
 * to repeat never tiles. A shorthand the build still writes there (a plain
 * `background` color) is named in the result when it resets such a
 * longhand. Checked on an editor theme over each official theme, and on a
 * stress theme of layered, positioned and one-mode gradients.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';
import {shorthandsAfterOwnLonghands} from '../../test-utils/css-shorthand-order.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

const T = 600_000;
const OFFICIAL = [
  'neutral',
  'butter',
  'chocolate',
  'gothic',
  'matcha',
  'stone',
  'y2k',
];

/** @type {string} */
let cwd;
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-variant-gradient-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, OFFICIAL);
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug */
const css = slug =>
  fs.readFileSync(path.join(cwd, `themes/${slug}/${slug}.css`), 'utf8');

/**
 * Each rule whose selector starts with a part's class, with its body.
 * @param {string} text
 * @param {string} part
 */
const rulesOn = (text, part) =>
  [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(m => ({selector: m[1].trim(), body: m[2]}))
    .filter(r => r.selector.startsWith(`.astryx-${part}`));

/** The value a rule body gives a property, or null. @param {string} body @param {string} prop */
const valueIn = (body, prop) =>
  new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`).exec(body)?.[1].trim() ??
  null;

describe('a variant or state gradient over a whole-part background longhand', () => {
  it.each(OFFICIAL)(
    'is built as longhands on a theme over %s, and the part keeps its repeat',
    async like => {
      if (unbuilt) return;
      const slug = `g-${like}`;
      await themeEditNew(slug, {cwd, like});
      const steps =
        /** @type {Array<[string, string, Record<string, string>]>} */ ([
          ['background-repeat', 'no-repeat', {on: 'button'}],
          [
            'background',
            'linear-gradient(#ffffff, #e6e6e6)',
            {on: 'button', when: 'variant:secondary'},
          ],
          [
            'background',
            'linear-gradient(#e6e6e6, #cccccc)',
            {on: 'button', state: 'hover'},
          ],
        ]);
      for (const [thing, value, flags] of steps)
        await themeEditSet(slug, thing, value, {cwd, ...flags});
      const built = css(slug);
      const rules = rulesOn(built, 'button');
      // The whole part's repeat is written once, on its own rule.
      expect(
        rules.some(r => valueIn(r.body, 'background-repeat') === 'no-repeat'),
      ).toBe(true);
      // Every rule the gradients go into writes the image alone: no
      // background shorthand, which would reset the repeat there.
      const withGradient = rules.filter(r => /gradient\(/.test(r.body));
      expect(withGradient.length).toBeGreaterThanOrEqual(2);
      for (const r of withGradient) {
        expect(valueIn(r.body, 'background')).toBeNull();
        expect(valueIn(r.body, 'background-image')).toMatch(
          /^linear-gradient\(/,
        );
        expect(valueIn(r.body, 'background-repeat')).toBeNull();
      }
      expect(shorthandsAfterOwnLonghands(built)).toEqual([]);
    },
    T,
  );
});

describe('a stress theme of gradients', () => {
  it(
    'writes each layer as the longhands it gives, its color under it, in both modes or one',
    async () => {
      if (unbuilt) return;
      await themeEditNew('s', {cwd, like: 'neutral'});
      await themeEditSet('s', 'background-size', '100% 50%', {cwd, on: 'card'});
      await themeEditSet(
        's',
        'background',
        'linear-gradient(#111111, #222222) center / 50% no-repeat, radial-gradient(#333333, transparent), ivory',
        {cwd, on: 'card', state: 'hover'},
      );
      await themeEditSet(
        's',
        'background',
        'linear-gradient(#000000, #444444)',
        {
          cwd,
          on: 'card',
          when: 'variant:muted',
          mode: 'dark',
        },
      );
      const built = css('s');
      const hover = rulesOn(built, 'card').find(
        r =>
          /:hover/.test(r.selector) &&
          /gradient\(/.test(r.body) &&
          !/data-variant/.test(r.selector),
      );
      expect(hover).toBeTruthy();
      const body = /** @type {{body: string}} */ (hover).body;
      expect(valueIn(body, 'background')).toBeNull();
      expect(valueIn(body, 'background-image')).toBe(
        'linear-gradient(#111111, #222222), radial-gradient(#333333, transparent)',
      );
      expect(valueIn(body, 'background-position')).toBe('center, 0% 0%');
      expect(valueIn(body, 'background-size')).toBe('50%, auto');
      expect(valueIn(body, 'background-repeat')).toBe('no-repeat, repeat');
      expect(valueIn(body, 'background-color')).toBe('ivory');
      // The one-mode gradient goes into that mode's block, as an image.
      expect(built).toMatch(
        /background-image:\s*linear-gradient\(#000000, #444444\)/,
      );
      expect(built).not.toMatch(/background:\s*linear-gradient/);
      expect(shorthandsAfterOwnLonghands(built)).toEqual([]);
    },
    T,
  );

  it(
    'names a plain background a variant writes that resets a whole-part longhand',
    async () => {
      if (unbuilt) return;
      await themeEditNew('w', {cwd, like: 'neutral'});
      await themeEditSet('w', 'background-size', '100% 50%', {cwd, on: 'card'});
      const r = await themeEditSet('w', 'background', 'red', {
        cwd,
        on: 'card',
        when: 'variant:muted',
      });
      expect(r.data.notes.join('\n')).toMatch(
        /card variant:muted: its background resets the background-size set on the whole card, so that background-size does not apply there/,
      );
    },
    T,
  );
});
