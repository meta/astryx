// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A role color the base theme takes away from a part on its own is
 * listed under missed once the theme moves that role: the base pointing
 * the role tokens at others there (stone's info banner on its categorical
 * blue), or a variant named for the role drawn in a color of its palette
 * written out (stone's accent progress fill). Each line, followed, ends the
 * entry; an untouched base lists none.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditShow} from './theme-edit.mjs';
import {splitCommand} from './_vet.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

const T = 400_000;
/** @type {string} */
let cwd;
// (Show's open problems and missed list come from the theme, not from the
// sheet it writes: one small section of the sheet is drawn, not all of it.)
const looked = () => ({cwd, section: 'actions'});
/** @type {string} */
let unbuilt = '';
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-role-tokens-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  unbuilt = await installRealBaseThemes(cwd, ['neutral', 'stone', 'gothic']);
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} line */
async function follow(line) {
  for (const one of line.split(' && ')) {
    const args = splitCommand(one.slice(one.indexOf('experimental ')));
    const r = await runCli(/** @type {string[]} */ (args), {cwd});
    expect(r.status, `${one}\n${r.stderr}`).toBe(0);
  }
}
/** @param {string} slug */
const roleMisses = async slug =>
  /** @type {Array<{part: string, why: string, line: string}>} */ (
    /** @type {any} */ (await themeEditShow(slug, looked())).data.missed ?? []
  ).filter(x => /base theme points|palette written out/.test(x.why));

describe('a role color the base takes away from a part', () => {
  it(
    'lists nothing on an untouched base',
    async () => {
      if (unbuilt) return;
      await themeEditNew('s0', {
        cwd,
        like: 'stone',
        settings: {corners: 'round'},
      });
      expect(await roleMisses('s0')).toEqual([]);
    },
    T,
  );

  it(
    "lists stone's info banner and accent progress fill, and their lines end them",
    async () => {
      if (unbuilt) return;
      await themeEditNew('s', {
        cwd,
        like: 'stone',
        settings: {info: '#6b21a8', accent: '#c2410c'},
      });
      const before = await roleMisses('s');
      const banner = before.find(x => x.part === 'banner');
      expect(banner?.why).toMatch(
        /--color-info-muted at --color-background-blue/,
      );
      expect(banner?.why).toMatch(/--color-on-info-muted at --color-text-blue/);
      expect(banner?.line).toMatch(/--on banner --when status:info/);
      const fill = before.find(x => x.part === 'progress-bar-fill');
      expect(fill?.line).toMatch(
        /background-color 'var\(--color-accent\)' --on progress-bar-fill --when variant:accent/,
      );
      for (const x of before) await follow(x.line);
      expect(await roleMisses('s')).toEqual([]);
    },
    T,
  );

  it(
    "lists gothic's info banner",
    async () => {
      if (unbuilt) return;
      await themeEditNew('g', {
        cwd,
        like: 'gothic',
        settings: {info: '#ff00e6'},
      });
      const banner = (await roleMisses('g')).find(x => x.part === 'banner');
      expect(banner?.line).toMatch(
        /--color-info-muted '#[0-9a-fA-F]{6,8}' --on banner --when status:info/,
      );
    },
    T,
  );
});
