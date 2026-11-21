// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A theme made one-mode draws its page for that mode only, so the page
 * note comes once, as it does when a page color is set.
 */

import {afterAll, beforeAll, expect, it, vi} from 'vitest';
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

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-page-note-one-mode-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

const NOTE = /page color shows inside AppShell/;

/** @param {any} r */
const notes = r => JSON.stringify(r?.data?.notes ?? []);

it('a theme made dark-only says the page note once', async () => {
  await themeEditNew('m1', {cwd, like: 'neutral'});
  const first = await themeEditSet('m1', 'mode', 'dark-only', {cwd});
  expect(notes(first)).toMatch(NOTE);
  const back = await themeEditSet('m1', 'mode', 'both', {cwd});
  expect(notes(back)).not.toMatch(NOTE);
  const lightOnly = await themeEditSet('m1', 'mode', 'light-only', {cwd});
  expect(notes(lightOnly)).toMatch(NOTE);
  const again = await themeEditSet('m1', 'mode', 'dark-only', {cwd});
  expect(notes(again)).not.toMatch(NOTE);
}, 300_000);

it('a theme that sets its page color says no page note when made one-mode', async () => {
  await themeEditNew('m2', {cwd, like: 'neutral'});
  await themeEditSet('m2', '--color-background-body', '#101010', {cwd});
  const r = await themeEditSet('m2', 'mode', 'dark-only', {cwd});
  expect(notes(r)).not.toMatch(NOTE);
}, 300_000);

it('a theme made one-mode says no page note again on its first page color', async () => {
  await themeEditNew('m3', {cwd, like: 'neutral'});
  expect(notes(await themeEditSet('m3', 'mode', 'dark-only', {cwd}))).toMatch(
    NOTE,
  );
  const r = await themeEditSet('m3', '--color-background-body', '#101010', {
    cwd,
  });
  expect(notes(r)).not.toMatch(NOTE);
}, 300_000);

it('a theme that was never made one-mode says the page note on its first page color', async () => {
  await themeEditNew('m4', {cwd, like: 'neutral'});
  const r = await themeEditSet('m4', '--color-background-body', '#101010', {
    cwd,
  });
  expect(notes(r)).toMatch(NOTE);
}, 300_000);
