// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A part setting that writes what Core already draws there at rest
 * (pill corners on a badge, which is round already) says it changes
 * nothing you see; one that changes the drawing lists what it styled.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
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
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-set-repeats-drawn-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('t', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('a part setting Core already draws', () => {
  it('pill corners on a badge change nothing you see', async () => {
    if (unbuilt) return;
    const r = /** @type {any} */ (
      await themeEditSet('t', 'corners', 'pill', {cwd, on: 'badge'})
    );
    const text = JSON.stringify(r);
    expect(text).toContain('this changes nothing you see');
    expect(r.data?.styled ?? r.styled).toEqual([]);
  }, 240_000);

  it('square corners on a badge are styled', async () => {
    if (unbuilt) return;
    const r = /** @type {any} */ (
      await themeEditSet('t', 'corners', 'square', {cwd, on: 'badge'})
    );
    expect(JSON.stringify(r.data?.styled ?? r.styled)).toMatch(
      /badge: border-radius 0px/,
    );
    expect(JSON.stringify(r)).not.toContain('this changes nothing you see');
  }, 240_000);
});
