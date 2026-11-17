// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A radius of two to four corners on a part whose corners Core reads inside
 * calc() (a menu's popup and its rows) is taken: each corner goes on the
 * box and the first corner is the one length the variable takes. How reads
 * "corners 0 0 6px 6px" as that radius. Against real bundled base themes.
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
  cwd = makeLinkedFixture('astryx-theme-menu-corner-radii-', FIXTURE_PACKAGES);
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
    writes: (data.results?.[0]?.commands ?? [])
      .filter((/** @type {string} */ c) => / editor set /.test(c))
      .map((/** @type {string} */ c) => c.replace(/^.*? editor /, '')),
  };
};

describe('per-corner radius on a menu', () => {
  it('is taken, each corner on the box, and read by how', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('m', {cwd, like: 'neutral'});
    await themeEditSet('m', 'border-radius', '0 0 6px 6px', {
      cwd,
      on: 'dropdown-menu',
    });
    const css = fs.readFileSync(path.join(cwd, 'themes', 'm', 'm.css'), 'utf8');
    const rule = /\.astryx-dropdown-menu \{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(rule).toMatch(/border-top-left-radius: 0;/);
    expect(rule).toMatch(/border-bottom-right-radius: 6px;/);
    expect(rule).toMatch(/border-bottom-left-radius: 6px;/);
    // (Five lengths are no radius.)
    await expect(
      themeEditSet('m', 'border-radius', '1px 2px 3px 4px 5px', {
        cwd,
        on: 'dropdown-menu',
      }),
    ).rejects.toThrow(/only one length works/);
    expect(
      (await answer('dropdown menu corners 0 0 6px 6px', 'm')).writes,
    ).toEqual([
      expect.stringMatching(
        /set m border-radius '0(?:px)? 0 6px 6px' --on dropdown-menu$/,
      ),
    ]);
  }, 240_000);
});
