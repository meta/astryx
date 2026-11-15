// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `missed` names what keeps the base's look beside the theme's own:
 * a part on the base's dark inverted surface once the theme's surfaces
 * changed (a Win98-like theme's tooltip), a soft shadow beside square
 * corners, and a status fill only where its dial builds a color of its
 * own. Each line changes the built theme, and how's answer for the part
 * leads with it. Every line offered is followed.
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

const T = 300_000;
const ED = ['experimental', 'theme', 'editor'];
/** @type {string} */
let cwd;
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-missed-overlays-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  // The real neutral: its overlays draw the inverted surface Core gives.
  await installRealBaseThemes(cwd, ['neutral']);
  await themeEditNew('w', {cwd, like: 'neutral'});
  await themeEditSet('w', 'neutral', '#808080', {cwd});
  await themeEditSet('w', '--color-background-surface', '#c0c0c0', {cwd});
  await themeEditSet('w', '--color-background-body', '#008080', {cwd});
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** Follow a printed line, each `&&` step. @param {string} line */
async function follow(line) {
  for (const step of line.split(' && ')) {
    const args = splitCommand(step.slice(step.indexOf('experimental ')));
    if (!args) throw new Error(`cannot read ${step}`);
    const r = await runCli(args, {cwd});
    expect(r.status, `${step}\n${r.stderr}`).toBe(0);
  }
}
/** @param {string} slug */
const data = async slug =>
  /** @type {any} */ (await themeEditShow(slug, {cwd})).data;

describe('a part on the base dark inverted surface', () => {
  it(
    'is how answers for the tooltip in plain words',
    async () => {
      const tip = (await data('w')).missed.find(
        (/** @type {any} */ m) => m.part === 'tooltip',
      );
      expect(tip?.why).toMatch(/the theme's surfaces changed/);
      for (const ask of [
        'make the tooltips match the theme',
        'tooltips grey like the rest',
      ]) {
        const r = JSON.parse(
          (await runCli([...ED, 'how', ask, '--theme', 'w', '--json'], {cwd}))
            .stdout,
        );
        /** @param {string} c */
        const bare = c => c.slice(c.indexOf('experimental '));
        expect(r.data.results[0].commands.map(bare)).toEqual(
          tip.line.split(' && ').map(bare),
        );
      }
    },
    T,
  );

  it(
    'is listed once the theme surfaces change, and its line gives it the theme surface',
    async () => {
      const d = await data('w');
      const parts = d.missed.map((/** @type {any} */ m) => m.part);
      expect(parts).toEqual(expect.arrayContaining(['tooltip']));
      for (const part of ['toast', 'tooltip']) {
        const m = (await data('w')).missed.find(
          (/** @type {any} */ x) => x.part === part,
        );
        if (m) await follow(m.line);
      }
      const after = await data('w');
      expect(
        after.missed.filter((/** @type {any} */ m) => /inverted/.test(m.why)),
      ).toEqual([]);
      expect(
        after.openProblems.filter((/** @type {any} */ p) =>
          /\b(toast|tooltip)\b/.test(p.problem),
        ),
      ).toEqual([]);
    },
    T,
  );

  it(
    'on a dark-only theme, its line names no light mode',
    async () => {
      await runCli(
        [...ED, 'new', 'd', '--like', 'neutral', '--mode', 'dark-only'],
        {cwd},
      );
      await themeEditSet('d', '--color-background-body', '#000000', {cwd});
      await themeEditSet('d', '--color-background-surface', '#0a0a0a', {cwd});
      const list = (await data('d')).missed;
      expect(list.length).toBeGreaterThan(0);
      for (const m of list) expect(m.line).not.toMatch(/--mode light/);
      for (const m of list) await follow(m.line);
    },
    T,
  );
});

describe('a soft shadow beside square corners', () => {
  it(
    'is listed with a line that takes its blur away',
    async () => {
      await themeEditNew('s', {cwd, like: 'neutral'});
      await themeEditSet('s', 'corners', 'square', {cwd});
      const m = (await data('s')).missed.find(
        (/** @type {any} */ x) => x.part === 'popover',
      );
      expect(m?.why).toMatch(/soft shadow/);
      expect(m.line).toMatch(/box-shadow '.*0px.*' --on popover/);
      await follow(m.line);
      expect(
        (await data('s')).missed.some(
          (/** @type {any} */ x) => x.part === 'popover',
        ),
      ).toBe(false);
    },
    T,
  );
});

describe('a status fill', () => {
  it(
    'is not missed when its dial would give the base color back',
    async () => {
      await themeEditNew('a', {cwd, like: 'neutral'});
      await themeEditSet('a', 'accent', '#0b6e4f', {cwd});
      expect(
        (await data('a')).missed.some(
          (/** @type {any} */ x) => x.part === 'banner',
        ),
      ).toBe(false);
    },
    T,
  );
});
