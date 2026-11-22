// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * The contrast check measures a part on the fill the build draws there: a
 * part's own `--only` fill keeps it under a later group fill, so the check
 * reads the part's own fill, reports no problem the built theme does not
 * have, and suggests no color that makes the drawn pair worse. Against a
 * real bundled base theme.
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
/** @type {string | null} */
let unbuilt = null;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-contrast-drawn-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {{skip: (note?: string) => void}} ctx */
const needBases = ctx => {
  if (unbuilt) ctx.skip(unbuilt);
  return Boolean(unbuilt);
};

describe('the contrast check', () => {
  it('measures a part on its own fill under a later group fill', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('drawn', {cwd, like: 'neutral'});
    await themeEditSet('drawn', 'background-color', '#000000', {
      cwd,
      on: 'top-nav-item',
      only: true,
    });
    await themeEditSet('drawn', 'background-color', '#f0f0f0', {
      cwd,
      on: 'selected-items',
    });
    const r = /** @type {any} */ (
      await themeEditSet('drawn', 'color', '#bfbfbf', {
        cwd,
        on: 'top-nav-item',
      })
    );
    // (The build draws #bfbfbf on the link's own #000000, 11.42:1.)
    const problems = JSON.stringify(r.data.newProblems ?? []);
    expect(problems).not.toMatch(/1\.61:1/);
    expect(problems).not.toMatch(/#6d6d6d/);
  }, 240_000);
});
