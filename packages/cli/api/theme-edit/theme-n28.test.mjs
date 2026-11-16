// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A color dial made lighter or darker steps from the color it grows
 * its shades from: its saved seed, else its token where that is a color of
 * its own. A see-through wash is no seed, and a gray grows the same shades
 * whatever its lightness, so neither answers with a change that does
 * nothing; the exact token as an alternative keeps its own strength.
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

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-n28-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('ne', {cwd, like: 'neutral'});
  await themeEditNew('warm', {cwd, like: 'neutral'});
  await themeEditSet('warm', 'neutral', '#78716c', {cwd});
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} theme @param {string} ask */
const how = async (theme, ask) => {
  const {data} = /** @type {any} */ (await themeEditHow(ask, {cwd, theme}));
  const rs = /** @type {Array<{text: string, commands: string[]}>} */ (
    data.results ?? []
  );
  return {
    text: rs.map(r => r.text).join('\n'),
    writes: rs
      .flatMap(r => r.commands)
      .filter(c => / editor (set|undo) /.test(c)),
  };
};

describe('a color dial lighter or darker', () => {
  it.each(['make the neutral color darker', 'make the neutral lighter'])(
    '%s on a theme with no neutral color: no write, a true reason',
    async ask => {
      const r = await how('ne', ask);
      expect(r.writes).toEqual([]);
      expect(r.text).toMatch(/--color-neutral is a see-through wash/);
    },
    120_000,
  );

  it('a gray neutral seed: no write, a true reason', async () => {
    const r = await how('warm', 'make the neutral color darker');
    expect(r.writes).toEqual([]);
    expect(r.text).toMatch(/is a gray \(#78716c\).*changes nothing/);
  }, 120_000);

  it('a color with a seed of its own still steps', async () => {
    const r = await how('ne', 'make the danger color darker');
    expect(r.writes.join('\n')).toMatch(/ set ne danger '#[0-9a-f]{6}'/);
  }, 120_000);
});
