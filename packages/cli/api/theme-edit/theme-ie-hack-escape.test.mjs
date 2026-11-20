// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A value ending in an old browser hack's escape (`8px\9`, `none\0`)
 * is refused, as a browser drops it, with the value without the escape
 * offered; never written.
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
import {matchValue} from './_css.mjs';
import {isSafeValue} from './_color.mjs';
import {withoutCopyDebris} from './_normal.mjs';
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
const saved = () => JSON.parse(fs.readFileSync(file(), 'utf8')).settings;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-ie-hack-', FIXTURE_PACKAGES);
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

describe("an old browser hack's escape at a value's end", () => {
  it('matches no grammar, is no safe value, and is copy debris', () => {
    expect(matchValue('padding', '8px\\9')).toBeNull();
    expect(matchValue('padding', '8px \\9')).toBeNull();
    expect(matchValue('box-shadow', 'none\\0')).toBeNull();
    expect(matchValue('padding', '8px')).not.toBeNull();
    expect(isSafeValue('8px\\9')).toBe(false);
    // An escape inside a quoted string is text.
    expect(isSafeValue('"a\\9 b"')).toBe(true);
    expect(withoutCopyDebris('8px\\9;')).toBe('8px');
  });

  for (const [thing, value, on, line] of [
    ['padding', '8px\\9', 'card', / set t padding 8px --on card$/],
    ['padding', '8px \\9', 'card', / set t padding 8px --on card$/],
    ['box-shadow', 'none\\9', 'card', / set t box-shadow none --on card$/],
    ['--spacing-4', '8px\\9', undefined, / set t --spacing-4 8px$/],
  ]) {
    it(
      `${thing} "${value}" is refused with the value without it, and nothing is written`,
      async () => {
        const e = await refusal(() =>
          themeEditSet(
            't',
            /** @type {string} */ (thing),
            /** @type {string} */ (value),
            {cwd, ...(on ? {on: /** @type {string} */ (on)} : {})},
          ),
        );
        expect(e.message).toContain('an old browser hack');
        expect(e.run).toContainEqual(expect.stringMatching(line));
        expect(saved()).toEqual([]);
      },
      T,
    );
  }
});
