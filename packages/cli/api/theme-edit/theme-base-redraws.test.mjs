// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A token the base theme draws past on a part (neutral's neutral badge
 * fills with --color-background-gray, not Core's --color-neutral): setting
 * it says that part does not use it, with the command that does; `how` of
 * the token names it; and a value question answers what the part draws,
 * the theme's own setting there first.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
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
/** @type {any} */
let setData;

/** @param {string} ask */
const answer = async ask =>
  /** @type {any} */ ((await themeEditHow(ask, {cwd, theme: 'p'})).data)
    .results?.[0]?.text ?? '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-d-redraw-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('p', {cwd, like: 'neutral'});
  setData = (
    await themeEditSet('p', '--color-neutral', 'rgba(196, 170, 240, 0.16)', {
      cwd,
    })
  ).data;
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('a token the base theme draws past on a part', () => {
  it('set says the neutral badge does not use it, with the command that does', () => {
    expect(setData.notes.join('\n')).toMatch(
      /badge \(variant neutral\) does not use --color-neutral: the neutral theme draws its background-color from var\(--color-background-gray\) there; to change it: .* set p background-color 'rgba\(196, 170, 240, 0\.16\)' --on badge --when variant:neutral/,
    );
  });

  it('how of the token names where it does not reach', async () => {
    const {data} = /** @type {any} */ (
      await themeEditHow('--color-neutral', {cwd, theme: 'p'})
    );
    expect(data.notIn.join('\n')).toMatch(
      /^badge \(variant neutral\): the neutral theme draws its background-color from var\(--color-background-gray\)/,
    );
  });

  it('a value question answers what the badge draws, then the theme own setting there', async () => {
    expect(
      await answer('what is the background of neutral badges in dark mode'),
    ).not.toMatch(/rgba\(196, 170, 240/);
    await themeEditSet('p', 'background-color', '#3a2e4a', {
      cwd,
      on: 'badge',
      when: 'variant:neutral',
      mode: 'dark',
    });
    expect(
      await answer('what is the background of neutral badges in dark mode'),
    ).toMatch(/has background-color #3a2e4a in dark mode \(neutral\)/);
  }, 120_000);
});
