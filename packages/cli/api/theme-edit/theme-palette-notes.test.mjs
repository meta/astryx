// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What the palette notes say matches what they do: the neutral color
 * reaches the page (or the page keeps a color the theme sets for it), and a
 * moved accent text color names only the grounds it fails on.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {DIALS} from './_tables.mjs';
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

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-d-notes-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('t', {cwd, like: 'neutral'});
  await themeEditNew('p', {cwd, like: 'neutral'});
  await themeEditSet('p', '--color-background-body', '#ffffff', {cwd});
  await themeEditNew('g', {cwd, like: 'neutral'});
  await themeEditSet('g', '--color-background-body', '#ffffff', {cwd});
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {any} r */
const notesOf = r => /** @type {string[]} */ (r.data.notes ?? []).join('\n');

describe('the neutral color and the page', () => {
  it('says the page follows it, as it does', async () => {
    const n = notesOf(await themeEditSet('t', 'neutral', '#59636e', {cwd}));
    expect(n).toMatch(/the page background follows it too/);
    expect(n).not.toMatch(/stays the base theme/);
    expect(DIALS.neutral.help).toMatch(/The page background follows it too/);
    expect(DIALS.neutral.help).not.toMatch(/never tints the page/);
  });

  it('says a page color the theme sets keeps its color', async () => {
    const n = notesOf(await themeEditSet('p', 'neutral', '#59636e', {cwd}));
    expect(n).toMatch(/the page background keeps the color you set for it/);
  });
});

describe('a moved accent text color', () => {
  it('names only the grounds it fails on', async () => {
    const r = await themeEditSet('g', 'accent', '#0969da', {cwd});
    const line = notesOf(r)
      .split('\n')
      .find(x => /--color-text-accent light: your exact color/.test(x));
    expect(line).toBeDefined();
    // It reads on the white page, surface and cards; only the accent tint
    // fails.
    expect(line).toMatch(/reads at only [\d.]+:1 on --color-accent-muted \(/);
    expect(line).not.toMatch(/--color-background-(body|surface|card)/);
  });
});
