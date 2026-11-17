// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The lines show offers for text on Core's media surfaces end the
 * problems they name: a button drawn with its default props is the variant
 * Core draws (its fix reaches that variant only); a caption on a lightbox's
 * own bar takes the lightbox's on-color, which set accepts; and a link at a
 * page's name is left alone and named, not refused. (A light overlay given
 * the overlay back is the media-scheme test's, on the real neutral theme.)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
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

const T = 600_000;
/** @type {string} */
let cwd;
// (Show's open problems and missed list come from the theme, not from the
// sheet it writes: one small section of the sheet is drawn, not all of it.)
const looked = () => ({cwd, section: 'actions'});
beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-media-lines-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
});
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug */
const open = async slug =>
  /** @type {Array<{problem: string, fix: string | null}>} */ (
    /** @type {any} */ (await themeEditShow(slug, looked())).data.openProblems
  );
/** @param {string} fix */
async function follow(fix) {
  const args = splitCommand(fix.slice(fix.indexOf('experimental ')));
  const r = await runCli(/** @type {string[]} */ (args), {cwd});
  expect(r.status, `${fix}\n${r.stderr}`).toBe(0);
}
/** Follow show's first line until none is left. @param {string} slug */
async function settle(slug) {
  /** @type {string[]} */
  const followed = [];
  let left = await open(slug);
  for (let i = 0; i < 8 && left.some(p => p.fix); i++) {
    const fix = /** @type {string} */ (left.find(p => p.fix)?.fix);
    followed.push(fix);
    await follow(fix);
    left = await open(slug);
  }
  return {left, followed};
}

describe('lines for text on a media surface', () => {
  it(
    'a mode-only button color and its variant fixes end at none, never rewriting every variant',
    async () => {
      await themeEditNew('n', {cwd, like: 'neutral'});
      await themeEditSet('n', 'color', '#111111', {
        cwd,
        on: 'button',
        mode: 'dark',
      });
      const {left, followed} = await settle('n');
      expect(left).toEqual([]);
      for (const f of followed) expect(f).toMatch(/--when variant:/);
    },
    T,
  );

  it(
    'a caption on the lightbox bar gets a line set accepts, which ends it',
    async () => {
      await themeEditNew('c', {cwd, like: 'neutral'});
      await themeEditSet('c', '--color-on-light', '#ffffff', {cwd});
      const first = (await open('c')).find(p =>
        /--on lightbox/.test(p.fix ?? ''),
      );
      expect(first?.fix).not.toMatch(/--color-text-/);
      const {left} = await settle('c');
      expect(left).toEqual([]);
    },
    T,
  );

  it(
    'a text token on the lightbox is refused with a line that reaches it',
    async () => {
      // (A refusal changes nothing: the caption case's theme serves.)
      const r = await runCli(
        [
          'experimental',
          'theme',
          'editor',
          'set',
          'c',
          '--color-text-primary',
          '#000000',
          '--on',
          'lightbox',
          '--json',
        ],
        {cwd},
      );
      expect(r.status).toBe(1);
      const run = JSON.parse(r.stdout).suggestions?.[0]?.name ?? '';
      expect(run).toMatch(/--color-on-dark '#000000' --on lightbox/);
    },
    T,
  );
});

describe('a link at a page name', () => {
  it(
    'is left alone and named; show and set still run',
    async () => {
      await themeEditNew('l', {cwd, like: 'neutral'});
      const out = path.join(cwd, 'elsewhere.html');
      fs.writeFileSync(out, 'mine');
      const dir = path.join(cwd, 'themes/l');
      for (const n of [
        'preview.html',
        'sheet.html',
        'sheet-overlays.html',
        'l.pictures.json',
      ]) {
        fs.rmSync(path.join(dir, n), {force: true});
        fs.symlinkSync(out, path.join(dir, n));
      }
      const shown = /** @type {any} */ (await themeEditShow('l', {cwd}));
      expect(JSON.stringify(shown.data)).toMatch(/is a link/);
      await themeEditSet('l', 'accent', '#7c3aed', {cwd});
      expect(fs.readFileSync(out, 'utf8')).toBe('mine');
      for (const n of [
        'preview.html',
        'sheet.html',
        'sheet-overlays.html',
        'l.pictures.json',
      ])
        expect(fs.lstatSync(path.join(dir, n)).isSymbolicLink()).toBe(true);
    },
    T,
  );
});
