// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A theme that sets a whole-theme text size says, in show's notes,
 * that phones keep the base theme's reading sizes, so a measurement on a
 * touch screen under 1024px is no fault; a theme that sets none says
 * nothing of it.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture(
    'astryx-theme-show-sizes-skip-phones-',
    FIXTURE_PACKAGES,
  );
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('big', {cwd, like: 'neutral'});
  await themeEditSet('big', 'text-size', '17', {cwd});
  await themeEditNew('plain', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug */
const notesOf = async slug =>
  /** @type {string[]} */ (
    /** @type {any} */ ((await themeEditShow(slug, {cwd})).data).notes ?? []
  ).join('\n');

describe('a whole-theme text size on phones', () => {
  it('show names that phones keep the base reading sizes', async () => {
    if (unbuilt) return;
    expect(await notesOf('big')).toMatch(
      /text sizes: phones \(touch screens below 1024px wide\) keep the base theme reading sizes/,
    );
  }, 300_000);

  it('a theme with no size setting says nothing of it', async () => {
    if (unbuilt) return;
    expect(await notesOf('plain')).not.toMatch(/touch screens below 1024px/);
  }, 300_000);
});
