// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A file named in url() in a `how` ask is written as typed: its case,
 * its dots and its words are kept.
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
  cwd = makeLinkedFixture('astryx-theme-how-picture-values-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('pv', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} ask */
const texts = async ask => {
  const {data} = /** @type {any} */ (
    await themeEditHow(ask, {cwd, theme: 'pv'})
  );
  return /** @type {Array<{text: string}>} */ (data.results ?? []).map(
    r => r.text,
  );
};

/** @param {string} ask */
const commands = async ask => {
  const {data} = /** @type {any} */ (
    await themeEditHow(ask, {cwd, theme: 'pv'})
  );
  return /** @type {Array<{commands: string[]}>} */ (data.results ?? [])
    .flatMap(r => r.commands)
    .map(c => c.replace(/^.*? editor /, ''));
};

it.each([
  [
    'cards background-image: url(hero.jpg)',
    "set pv background-image 'url(hero.jpg)' --on card",
  ],
  [
    'cards background-image: url(Hero.JPG)',
    "set pv background-image 'url(Hero.JPG)' --on card",
  ],
  [
    'cards background-image: url(img/heroImage-one.png)',
    "set pv background-image 'url(img/heroImage-one.png)' --on card",
  ],
  [
    'header background url(/img/bg.webp) no-repeat',
    "set pv background 'url(/img/bg.webp) no-repeat' --on app-shell-header",
  ],
])(
  '%s: the file in url() is written as typed',
  async (ask, line) => {
    expect(await commands(ask)).toContain(line);
    // (A file inside url() is a value to write, never a picture to match.)
    expect(
      (await texts(ask)).some(t => /how reads words, never a picture/.test(t)),
    ).toBe(false);
  },
  240_000,
);
