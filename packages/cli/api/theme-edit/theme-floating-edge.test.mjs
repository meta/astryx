// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A panel that floats over the page needs an edge: under `surfaces
 * flat` menus, popovers and dialogs keep their own fill and a hairline
 * border (cards keep flat's tinted look), and a floating panel that a
 * theme leaves at the page's color with no border or shadow is a problem
 * whose line adds a 1px border.
 */

import fs from 'node:fs';
import path from 'node:path';
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

/** A part's base rule in a theme's built CSS. @param {string} slug @param {string} cls */
const rule = (slug, cls) =>
  new RegExp(`\\n {2}\\.astryx-${cls} \\{([^}]*)\\}`).exec(
    fs.readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8'),
  )?.[1] ?? '';

/** The open problems show lists. @param {string} slug */
const problems = async slug =>
  /** @type {Array<{problem: string, fix: string | null}>} */ (
    /** @type {any} */ ((await themeEditShow(slug, {cwd})).data).openProblems ??
      []
  );

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-d-float-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('fl', {cwd, like: 'neutral'});
  await themeEditSet('fl', 'surfaces', 'flat', {cwd});
  await themeEditNew('hs', {cwd, like: 'neutral'});
  await themeEditSet('hs', 'background-color', '#f1f1f1', {
    cwd,
    on: 'popover',
  });
  await themeEditSet('hs', 'box-shadow', 'none', {cwd, on: 'popover'});
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('a panel floating over the page', () => {
  it('under flat keeps its own fill and a hairline border; a card keeps the tint', () => {
    const popover = rule('fl', 'popover');
    expect(popover).toMatch(/border-style: solid;/);
    expect(popover).toMatch(/border-color: var\(--color-border\);/);
    expect(popover).toMatch(/box-shadow: none;/);
    expect(popover).not.toMatch(/background-color/);
    expect(rule('fl', 'card')).toMatch(/border-style: none;/);
  });

  it('flat and the plain base draw no floating panel without an edge', async () => {
    expect(
      (await problems('fl')).some(p =>
        /floating over the page/.test(p.problem),
      ),
    ).toBe(false);
  }, 120_000);

  it('a popover at the page color with no shadow is a problem, and its line clears it', async () => {
    const hit = (await problems('hs')).find(p =>
      /^the popover \(#f1f1f1\) is 1\.00:1 on the page .* no edge/.test(
        p.problem,
      ),
    );
    expect(hit?.fix).toMatch(
      /set hs border '1px solid var\(--color-border\)' --on popover$/,
    );
    await themeEditSet('hs', 'border', '1px solid var(--color-border)', {
      cwd,
      on: 'popover',
    });
    expect((await problems('hs')).some(p => /no edge/.test(p.problem))).toBe(
      false,
    );
  }, 120_000);
});
