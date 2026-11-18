// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A page background picture said whole (a pattern's gradient layers,
 * with their position, size and repeat words) is written as said on the
 * part that paints the page, never reduced to a two-color gradient.
 */

import {afterAll, beforeAll, expect, it, vi} from 'vitest';
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

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-how-page-picture-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('pp', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} ask */
const texts = async ask => {
  const {data} = /** @type {any} */ (
    await themeEditHow(ask, {cwd, theme: 'pp'})
  );
  return /** @type {Array<{text: string}>} */ (data.results ?? []).map(
    r => r.text,
  );
};

/** @param {string} ask */
const commands = async ask => {
  const {data} = /** @type {any} */ (
    await themeEditHow(ask, {cwd, theme: 'pp'})
  );
  return /** @type {Array<{commands: string[]}>} */ (data.results ?? [])
    .flatMap(r => r.commands)
    .map(c => c.replace(/^.*? editor /, ''));
};

it('writes a dot pattern as said', async () => {
  expect(
    await commands(
      'page background radial-gradient(#0002 1px, transparent 1px) 0 0/16px 16px',
    ),
  ).toContain(
    "set pp background 'radial-gradient(#0002 1px, transparent 1px) 0 0/16px 16px' --on app-shell",
  );
}, 240_000);

it('keeps every layer of a grid pattern, with its size', async () => {
  expect(
    await commands(
      'page background linear-gradient(#0001 1px, transparent 1px), linear-gradient(90deg, #0001 1px, transparent 1px) 0 0 / 24px 24px',
    ),
  ).toContain(
    "set pp background 'linear-gradient(#0001 1px, transparent 1px), linear-gradient(90deg, #0001 1px, transparent 1px) 0 0 / 24px 24px' --on app-shell",
  );
}, 240_000);

it('says the picture shows inside AppShell only', async () => {
  expect(
    (
      await texts(
        'page background radial-gradient(#0002 1px, transparent 1px) 0 0/16px 16px',
      )
    ).some(t => /^Your page picture shows inside AppShell/.test(t)),
  ).toBe(true);
}, 240_000);
