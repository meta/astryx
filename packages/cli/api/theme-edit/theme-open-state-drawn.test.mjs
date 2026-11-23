// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A part Core marks open (aria-expanded) is drawn open, so its open state
 * is one set names: a dropdown menu's submenu row while its flyout is
 * open, and a top nav's menu trigger while its menu is. Against real
 * bundled base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
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
  cwd = makeLinkedFixture('astryx-theme-open-state-drawn-', FIXTURE_PACKAGES);
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

describe('a part drawn open', () => {
  it('takes --state expanded on a submenu row and a top nav menu', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('o', {cwd, like: 'neutral'});
    expect(
      (await answer('make the open top nav menu blue', 'o')).writes,
    ).toContain(
      "set o background-color '#2563eb' --on top-nav-menu --state expanded",
    );
    for (const on of ['dropdown-menu-item', 'top-nav-menu'])
      await themeEditSet('o', 'background-color', '#2563eb', {
        cwd,
        on,
        state: 'expanded',
      });
    const css = fs.readFileSync(path.join(cwd, 'themes', 'o', 'o.css'), 'utf8');
    for (const on of ['dropdown-menu-item', 'top-nav-menu'])
      expect(css).toContain(`.astryx-${on}:is([aria-expanded="true"])`);
  }, 240_000);
});
