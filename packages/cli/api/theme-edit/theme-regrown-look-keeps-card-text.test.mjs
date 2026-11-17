// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A colour dial that grows a look's colours again keeps every text the base
 * theme draws on a card fill readable: butter's muted card after a warm gray,
 * and gothic's links on its card tints after a blue accent, open no problem.
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

/** @param {string} slug */
const open = async slug =>
  /** @type {Array<{problem: string}>} */ (
    /** @type {any} */ (await themeEditShow(slug, {cwd})).data.openProblems ??
      []
  ).map(p => p.problem);

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-regrow-card-text-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['butter', 'gothic']);
  if (unbuilt) throw new Error(unbuilt);
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('a regrown look keeps the base theme card text readable', () => {
  it("butter's muted card after a warm gray", async () => {
    await themeEditNew('b', {cwd, like: 'butter'});
    await themeEditSet('b', 'neutral', '#78716c', {cwd});
    expect(await open('b')).toEqual([]);
  }, 240_000);

  it("gothic's links on its card tints after a blue accent", async () => {
    await themeEditNew('g', {cwd, like: 'gothic'});
    await themeEditSet('g', 'accent', '#569cd6', {cwd});
    expect(await open('g')).toEqual([]);
  }, 240_000);
});
