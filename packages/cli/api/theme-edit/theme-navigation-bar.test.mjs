// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * "Navigation bar" is the app's top bar, as "nav bar" is, and a word of
 * how see-through a thing is ("translucent") is a known word, never one
 * half of a compound subject. Against real bundled base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-navigation-bar-', FIXTURE_PACKAGES);
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
const answer = async (q, theme) => {
  const {data} = await themeEditHow(q, {cwd, theme});
  return {
    parts: data.understood?.parts ?? [],
    writes: (data.results ?? [])
      .flatMap((/** @type {any} */ r) => r.commands)
      .filter((/** @type {string} */ c) => / editor set /.test(c))
      .map((/** @type {string} */ c) => c.replace(/^.*? editor /, '')),
    text: (data.results ?? []).map((/** @type {any} */ r) => r.text).join('\n'),
  };
};

describe('the navigation bar', () => {
  it('is the top bar, and a see-through word after it is no compound', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('v', {cwd, like: 'neutral'});
    expect((await answer('navigation bar blue', 'v')).writes).toEqual([
      "set v background-color '#2563eb' --on app-shell-header",
    ]);
    expect(
      (await answer('the navigation bar with a 1px bottom border', 'v')).writes,
    ).toEqual([
      "set v border-bottom '1px solid var(--color-border)' --on app-shell-header",
    ]);
    const see = await answer('nav bar translucent white', 'v');
    expect(see.parts).toEqual(['app-shell-header']);
    expect(see.text).not.toMatch(/no part is called/);
  }, 240_000);
});
