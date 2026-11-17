// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A var() with spaces inside its brackets (`var( --x )`) is read as
 * CSS reads it, the same as `var(--x)`, for a color, a size and a number.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {isColorValue, isNumber, isSize} from './_color.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

const T = 240_000;

/** @type {string} */
let cwd;
/** @type {string} */
let fresh;

const file = () => path.join(cwd, 'themes/t/t.settings.json');

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-var-inner-spaces-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
  fresh = fs.readFileSync(file(), 'utf8');
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

beforeEach(() => {
  fs.writeFileSync(file(), fresh);
});

describe('a var() with spaces inside its brackets', () => {
  it('is a color, a size and a number value as var(--x) is', () => {
    for (const v of ['var( --x )', 'var(--x )', 'var( --x)'])
      expect([isColorValue(v), isSize(v), isNumber(v)], v).toEqual([
        true,
        true,
        true,
      ]);
    expect(isColorValue('var( --x , red )')).toBe(true);
    expect(isColorValue('var( --x , 12px )')).toBe(false);
  });

  for (const v of [
    'var( --color-accent )',
    'var(--color-accent )',
    'var( --color-accent)',
  ])
    it(
      `background-color "${v}" on card is taken`,
      async () => {
        const r = await themeEditSet('t', 'background-color', v, {
          cwd,
          on: 'card',
        });
        expect(r.data.setting).toMatchObject({value: v});
      },
      T,
    );

  it(
    'on a color dial, it is refused for having no fixed color, as var(--x) is',
    async () => {
      const e = await refusal(() =>
        themeEditSet('t', 'accent', 'var( --color-error )', {cwd}),
      );
      expect(e.message).toContain('has no fixed color');
    },
    T,
  );
});
