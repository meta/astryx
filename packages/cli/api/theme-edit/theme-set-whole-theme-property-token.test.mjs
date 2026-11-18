// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor set`: a CSS property set with no part is refused (a
 * property is set on a part), and the refusal offers the whole-theme token
 * the property's aspect names, of the kind the value is: `border-width
 * 2px` is --border-width, `font-weight 300` --text-body-weight,
 * `line-height 1.6` --text-body-leading. That line runs and gets the look.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

const T = 240_000;

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-whole-prop-token-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('n', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {Promise<unknown>} p */
const refusal = async p => {
  try {
    await p;
  } catch (e) {
    return /** @type {any} */ (e);
  }
  throw new Error('expected a refusal');
};

describe('a CSS property with no part', () => {
  for (const [prop, value, token] of [
    ['border-width', '2px', '--border-width'],
    ['font-weight', '300', '--text-body-weight'],
    ['line-height', '1.6', '--text-body-leading'],
  ])
    it(
      `${prop} ${value} offers ${token}, and that line runs`,
      async () => {
        const e = await refusal(themeEditSet('n', prop, value, {cwd}));
        const lines = JSON.stringify(e);
        expect(lines).toContain(`set n ${token} ${value}`);
        const r = /** @type {any} */ (
          await themeEditSet('n', token, value, {cwd})
        );
        expect(r.data.setting.thing).toBe(token);
      },
      T,
    );
});
