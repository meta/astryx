// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A value question reads a token set on the part itself before the
 * theme's own. Against real bundled base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
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

/** Why a bundled theme could not be built here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-values-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {import('vitest').TestContext} ctx */
const needBases = ctx => {
  if (!unbuilt) return false;
  console.warn(`skipped: ${unbuilt}`);
  ctx.skip();
  return true;
};

/** @param {string} q @param {string} theme */
const said = async (q, theme) => {
  const {data} = await themeEditHow(q, {cwd, theme});
  return (data.results ?? []).map((/** @type {any} */ r) => r.text).join('\n');
};

describe('a value question', () => {
  it("reads a token set on the part, never the theme's own", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('v', {cwd, like: 'neutral'});
    await themeEditSet('v', '--border-width', '3px', {cwd, on: 'divider'});
    expect(await said('how thick are dividers', 'v')).toMatch(/\b3px\b/);
    await themeEditSet('v', '--radius-container', '20px', {cwd, on: 'card'});
    expect(await said('how round are the cards now?', 'v')).toMatch(/\b20px\b/);
    // (Another part keeps the theme's own value.)
    expect(await said('how round are dialogs?', 'v')).not.toMatch(/\b20px\b/);
  }, 240_000);
});
