// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A role color the theme sets (accent, success, warning, danger,
 * info) reaches the parts where the base theme draws that role on its own:
 * butter's success badge in its written-out green and its progress fill
 * through the success role, its
 * nav links in its own blue, stone's success banner pointed at its green.
 * The parts take the theme's color, the missed list stops listing them, and
 * a color the theme sets on the part itself stays.
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

/** @param {string} slug */
const css = slug =>
  fs.readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8');

/** A rule's body by its selector. @param {string} slug @param {string} selector */
const rule = (slug, selector) =>
  new RegExp(
    `\\n {2}${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`,
  ).exec(css(slug))?.[1] ?? '';

/** @param {string} slug */
const missed = async slug =>
  /** @type {Array<{part: string, why: string}>} */ (
    /** @type {any} */ ((await themeEditShow(slug, {cwd, json: true})).data)
      .missed
  );

const ROLE_WRITTEN_OUT =
  /written out|the base theme's own accent|the base theme points/;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-role-reach-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['butter', 'stone']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('bs', {cwd, like: 'butter'});
  await themeEditSet('bs', 'success', '#16a34a', {cwd});
  await themeEditNew('ss', {cwd, like: 'stone'});
  await themeEditSet('ss', 'success', '#16a34a', {cwd});
  await themeEditNew('all', {cwd, like: 'butter'});
  for (const [dial, color] of [
    ['accent', '#7c3aed'],
    ['success', '#15803d'],
    ['warning', '#b45309'],
    ['danger', '#b91c1c'],
    ['info', '#0369a1'],
  ])
    await themeEditSet('all', dial, color, {cwd});
}, 900_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('a role color reaches what the base theme draws in that role', () => {
  it("butter's success badge and progress fill take the theme's success", () => {
    const badge = rule('bs', '.astryx-badge[data-variant="success"]');
    expect(badge).toMatch(/background-color: var\(--color-success\);/);
    expect(badge).toMatch(/color: var\(--color-on-success\);/);
    expect(
      rule('bs', '.astryx-progress-bar-fill[data-variant="success"]'),
    ).toMatch(/background-color: var\(--color-success\);/);
  });

  it("stone's success banner and progress fill take the theme's success, so nothing is missed", async () => {
    expect(
      rule('ss', '.astryx-progress-bar-fill[data-variant="success"]'),
    ).toMatch(/background-color: var\(--color-success\);/);
    expect((await missed('ss')).filter(m => /success/.test(m.why))).toEqual([]);
  }, 120_000);

  it('every role dial on butter: no role color is left written out', async () => {
    expect(
      (await missed('all')).filter(m => ROLE_WRITTEN_OUT.test(m.why)),
    ).toEqual([]);
    expect(css('all')).toMatch(/var\(--color-text-accent\)/);
  }, 120_000);

  it('a color the theme sets on the part itself stays', async () => {
    await themeEditSet('bs', 'background-color', '#123456', {
      cwd,
      on: 'badge',
      when: 'variant:success',
    });
    expect(rule('bs', '.astryx-badge[data-variant="success"]')).toMatch(
      /background-color: #123456;/,
    );
  }, 120_000);
});
