// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A plain surface change leaves the colored and status variants their own
 * fill: under flat surfaces a blue card stays blue and the plain cards take
 * the flat fill. Against real bundled base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
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

/** Why a bundled theme could not be built here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-flat-keeps-colored-', FIXTURE_PACKAGES);
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

describe('flat surfaces', () => {
  it('fill the plain cards and keep the colored ones', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('f', {cwd, like: 'neutral'});
    await themeEditSet('f', 'surfaces', 'flat', {cwd});
    const css = fs.readFileSync(path.join(cwd, 'themes', 'f', 'f.css'), 'utf8');
    const rule = (/** @type {string} */ sel) =>
      new RegExp(`${sel.replace(/[.[\]"=]/g, '\\$&')} \\{[^}]*\\}`).exec(
        css,
      )?.[0] ?? '';
    expect(rule('.astryx-card[data-variant="default"]')).toMatch(
      /background-color:/,
    );
    expect(rule('.astryx-card')).not.toMatch(/background-color:/);
    expect(rule('.astryx-card[data-variant="blue"]')).not.toMatch(
      /background-color:/,
    );
  }, 240_000);
});
