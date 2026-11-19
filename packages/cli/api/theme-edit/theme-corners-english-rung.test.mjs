// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A corners rung said as an English word made from it (`rounded`,
 * `squared`) is offered as that rung first; Tailwind's size for the same
 * letters (`rounded` is 4px) comes after it, never alone.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
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
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

const T = 240_000;

/** The command lines a refusal offers (its did-you-mean words aside). @param {{run: string[]}} e */
const lines = e => e.run.filter(x => x.includes(' editor '));

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-corners-rung-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('a corners rung said as an English word', () => {
  it(
    '"rounded" offers round first, then Tailwind\'s 4px; round is taken',
    async () => {
      const e = await refusal(() =>
        themeEditSet('t', 'corners', 'rounded', {cwd}),
      );
      expect(e.message).toContain("Tailwind's rounded class is 4px");
      expect(lines(e)).toEqual([
        expect.stringMatching(/ set t corners round$/),
        expect.stringMatching(/ set t corners 4px$/),
      ]);
      const r = await themeEditSet('t', 'corners', 'round', {cwd});
      expect(r.data.setting).toMatchObject({value: 'round'});
      fs.rmSync(path.join(cwd, 'themes/t/t.history.json'), {force: true});
    },
    T,
  );

  it(
    '"squared" offers square alone; a Tailwind class keeps its size',
    async () => {
      const sq = await refusal(() =>
        themeEditSet('t', 'corners', 'squared', {cwd}),
      );
      expect(lines(sq)).toEqual([
        expect.stringMatching(/ set t corners square$/),
      ]);
      const md = await refusal(() =>
        themeEditSet('t', 'corners', 'rounded-md', {cwd}),
      );
      expect(lines(md)).toEqual([expect.stringMatching(/ set t corners 6px$/)]);
    },
    T,
  );
});
