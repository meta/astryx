// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A button on Core's media surface (an overlay's dark island) takes
 * the text color that surface gives: a glossy light button there is
 * measured with it, listed as a problem, and fixed by a color on the button
 * (its variant), which reaches it on the surface and reads on its fill
 * everywhere. Following every fix offered ends with none.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
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

// The assertions are about settings, notes and lines, not rendered pages:
// a render costs seconds, so the pages are written by the stand-in.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

const T = 400_000;
/** @type {string} */
let cwd;
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-media-buttons-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await installRealBaseThemes(cwd, ['neutral']);
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug */
const buttonProblems = async slug =>
  /** @type {Array<{problem: string, fix: string | null}>} */ (
    /** @type {any} */ (await themeEditShow(slug, {cwd})).data.openProblems
  ).filter(p => /text in button/.test(p.problem));

describe('a glossy button on an overlay', () => {
  it(
    'is measured with the media surface text, listed, and fixed by a color on the button',
    async () => {
      await themeEditNew('g', {cwd, like: 'neutral'});
      await themeEditSet(
        'g',
        'background',
        'linear-gradient(to bottom, #ffffff 0%, #e8e8e8 50%, #d0d0d0 100%)',
        {cwd, on: 'button', when: 'variant:secondary'},
      );
      const first = await buttonProblems('g');
      const onMedia = first.find(p =>
        / on (overlay-scrim|lightbox|toast) /.test(p.problem),
      );
      expect(onMedia?.problem).toMatch(/--color-on-dark/);
      expect(onMedia?.fix).toMatch(
        /set g color '#000000' --on button --when variant:secondary/,
      );
      let left = first;
      for (let i = 0; i < 8 && left.some(p => p.fix); i++) {
        const fix = /** @type {string} */ (left.find(p => p.fix)?.fix);
        const args = splitCommand(fix.slice(fix.indexOf('experimental ')));
        const r = await runCli(/** @type {string[]} */ (args), {cwd});
        expect(r.status, `${fix}\n${r.stderr}`).toBe(0);
        left = await buttonProblems('g');
      }
      expect(left).toEqual([]);
    },
    T,
  );
});
