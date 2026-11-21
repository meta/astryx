// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The first answer that sets the page color says, in its own lines,
 * how a page without AppShell takes it, so an agent that runs that answer
 * alone still paints its page.
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
  cwd = makeLinkedFixture('astryx-theme-how-page-first-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('pf', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} ask */
const firstPageAnswer = async ask => {
  const {data} = /** @type {any} */ (
    await themeEditHow(ask, {cwd, theme: 'pf'})
  );
  return /** @type {Array<{text: string, commands: string[]}>} */ (
    data.results ?? []
  ).find(r => r.commands.some(c => / --color-background-body /.test(c)));
};

it.each(['cream page background', 'deep purple background, dark mode only'])(
  '%s: the first page answer says how a page without AppShell takes it',
  async ask => {
    const answer = await firstPageAnswer(ask);
    expect(answer?.text).toMatch(
      /In an app without AppShell the page shows it only with `body \{ background: var\(--color-background-body\) \}` in global CSS/,
    );
  },
  240_000,
);

it('names the frame and main panel line when the answer offers it', async () => {
  expect((await firstPageAnswer('cream page background'))?.text).toMatch(
    /or with the second line \(the frame and the main panel\)$/,
  );
}, 240_000);
