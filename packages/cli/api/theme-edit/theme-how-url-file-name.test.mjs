// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A file named in url() in a `how` ask is a value, written as typed:
 * its case, dots and words are kept, and no word of its path is read as a
 * part, a correction or a break between asks.
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
  cwd = makeLinkedFixture('astryx-theme-how-url-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('pu', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} ask */
const answer = async ask => {
  const {data} = /** @type {any} */ (
    await themeEditHow(ask, {cwd, theme: 'pu'})
  );
  const results = /** @type {Array<{text: string, commands: string[]}>} */ (
    data.results ?? []
  );
  return {
    texts: results.map(r => r.text),
    commands: results
      .flatMap(r => r.commands)
      .map(c => c.replace(/^.*? editor /, '')),
  };
};

it.each([
  [
    'cards background-image: url(hero.jpg)',
    "set pu background-image 'url(hero.jpg)' --on card",
  ],
  [
    'cards background-image: url(Hero.JPG)',
    "set pu background-image 'url(Hero.JPG)' --on card",
  ],
  [
    'cards background-image: url(img/heroImage-one.png)',
    "set pu background-image 'url(img/heroImage-one.png)' --on card",
  ],
  [
    'cards background-image: url(/backgrounds/gradients.png)',
    "set pu background-image 'url(/backgrounds/gradients.png)' --on card",
  ],
  [
    'cards background-image: url(img/btn.png)',
    "set pu background-image 'url(img/btn.png)' --on card",
  ],
  [
    'cards background-image: url(/img/black-and-white.jpg)',
    "set pu background-image 'url(/img/black-and-white.jpg)' --on card",
  ],
  [
    'cards background-image: URL(hero.jpg)',
    "set pu background-image 'URL(hero.jpg)' --on card",
  ],
  [
    'cards background-image: url(/img/placeholder@2x.png)',
    "set pu background-image 'url(/img/placeholder@2x.png)' --on card",
  ],
  [
    'header background URL(/img/bg.webp) no-repeat',
    "set pu background 'URL(/img/bg.webp) no-repeat' --on app-shell-header",
  ],
  [
    'how rounded are cards? cards background-image: url(/locales/it/flag.png)',
    "set pu background-image 'url(/locales/it/flag.png)' --on card",
  ],
  [
    'how rounded are cards? cards background-image: url(hero.jpg)',
    "set pu background-image 'url(hero.jpg)' --on card",
  ],
  [
    'header background url(/img/bg.webp) no-repeat',
    "set pu background 'url(/img/bg.webp) no-repeat' --on app-shell-header",
  ],
])(
  '%s: written as typed, with no picture note',
  async (ask, line) => {
    const {texts, commands} = await answer(ask);
    expect(commands).toContain(line);
    expect(texts.some(t => /how reads words, never a picture/.test(t))).toBe(
      false,
    );
  },
  240_000,
);

it('a word in the path is never read as a part', async () => {
  const {commands} = await answer(
    'cards background-image: url(/img/avatars/me.png)',
  );
  expect(commands).toContain(
    "set pu background-image 'url(/img/avatars/me.png)' --on card",
  );
  expect(commands.some(c => /--on avatar/.test(c))).toBe(false);
}, 240_000);

it('a length in a file name is no value left unused', async () => {
  const {texts, commands} = await answer(
    'cards background-image: url(/icons/arrow-24px.svg)',
  );
  expect(commands).toContain(
    "set pu background-image 'url(/icons/arrow-24px.svg)' --on card",
  );
  expect(texts.some(t => /^not used/.test(t))).toBe(false);
}, 240_000);

it('a second url() layer left unwritten is named as not used', async () => {
  const {texts, commands} = await answer(
    'cards background-image: url(a.png), url(b.png)',
  );
  expect(commands).toContain("set pu background-image 'url(a.png)' --on card");
  expect(texts.some(t => /^not used/.test(t) && t.includes('url(b.png)'))).toBe(
    true,
  );
}, 240_000);

it("a word in a file's path changes no other ask", async () => {
  const alone = (await answer('menus opacity 0.9')).commands;
  const {commands} = await answer(
    'menus opacity 0.9, cards background-image: url(/img/frosted.png)',
  );
  for (const line of alone) expect(commands).toContain(line);
  expect(commands.some(l => /background-color .*--on menu/.test(l))).toBe(
    false,
  );
  expect(commands).toContain(
    "set pu background-image 'url(/img/frosted.png)' --on card",
  );
}, 240_000);
