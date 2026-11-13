// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A new accent on a real bundled base keeps the base theme's own secondary
 * text lift on the parts it lifts it on while that shade still reads, and
 * reports no change there.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
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

/** Why a bundled theme could not be installed here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-accent-lift-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, 300_000);

afterAll(() => removeLinkedFixture(cwd));
it('keeps the official secondary text lift on a new accent while it reads', async test => {
  if (unbuilt) {
    console.warn(`skipped: ${unbuilt}`);
    return test.skip();
  }
  await themeEditNew('t', {cwd, like: 'neutral'});
  /** @param {string} css */
  const lifts = css =>
    [...css.matchAll(/--color-text-secondary: (light-dark\([^;]*\));/g)]
      .slice(1)
      .map(m => m[1]);
  const before = lifts(
    fs.readFileSync(path.join(cwd, 'themes/t/t.css'), 'utf8'),
  );
  expect(before.length).toBe(5);
  const r = await themeEditSet('t', 'accent', '#E11D48', {cwd});
  const after = lifts(
    fs.readFileSync(path.join(cwd, 'themes/t/t.css'), 'utf8'),
  );
  expect(after).toEqual(before);
  expect(r.data.styled.filter(x => /color-text-secondary/.test(x))).toEqual([]);
}, 240_000);
