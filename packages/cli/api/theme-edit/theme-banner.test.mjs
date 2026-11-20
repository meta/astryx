// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * The surfaces dial draws a panel's line and shadow on the part that paints
 * its rounded fill: the banner's, inside its frame, so the line follows its
 * corners and a banner setting reaches it. Against real bundled base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
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
  cwd = makeLinkedFixture('astryx-theme-banner-', FIXTURE_PACKAGES);
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

/** @param {string} slug */
const cssOf = slug =>
  fs.readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8');

/** The declarations of one rule, by its exact selector. @param {string} css @param {string} sel */
const ruleOf = (css, sel) => {
  const at = css.indexOf(`${sel} {`);
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
};

describe('the surfaces dial on the banner', () => {
  it('draws the outline on the rounded banner, never its square frame', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('b', {cwd, like: 'neutral'});
    await themeEditSet('b', 'surfaces', 'outlined', {cwd});
    const css = cssOf('b');
    expect(ruleOf(css, '.astryx-banner-frame')).not.toMatch(/border-width/);
    expect(ruleOf(css, '.astryx-banner')).toMatch(/border-width:\s*1px/);
    // (A card, which paints its own fill, keeps it on itself.)
    expect(ruleOf(css, '.astryx-card')).toMatch(/border-width:\s*1px/);
    // A banner setting now reaches the line.
    await themeEditSet('b', 'border', 'none', {cwd, on: 'banner'});
    expect(ruleOf(cssOf('b'), '.astryx-banner')).toMatch(
      /border(?:-style)?:\s*none/,
    );
  }, 240_000);
});

describe('a product named with a version', () => {
  it('"Windows 11" is never the containers', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('w', {cwd, like: 'neutral'});
    const {data} = await themeEditHow('Windows 11 accent #0067c0', {
      cwd,
      theme: 'w',
    });
    expect(data.understood?.parts ?? []).not.toContain('containers');
    expect(
      (data.results ?? []).flatMap((/** @type {any} */ r) => r.commands),
    ).toContainEqual(expect.stringMatching(/ set w accent '?#0067c0'?$/));
  }, 240_000);
});
