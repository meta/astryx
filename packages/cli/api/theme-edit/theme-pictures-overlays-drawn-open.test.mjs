// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The pictures show overlays drawn open as they look open (their
 * opening animation run to its end); a change that changes nothing counts
 * what the theme still misses; a base's own state rule (butter's selected
 * nav item) is what the checks and `missed` judge; an inverted surface that
 * disappears into the page gets a line that makes it stand out again; a
 * border line on a part whose variants differ frames only the filled ones;
 * and with the theme's own corners at a pill, no pill is missed. Every line
 * offered is followed.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
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

// The assertions are about settings, builds, notes and lines, not rendered
// pages: a render costs seconds, so the pages are written by the stand-in.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

const T = 300_000;
const ED = ['experimental', 'theme', 'editor'];
/** @type {string} */
let cwd;
/** @type {string} */
let unbuilt = '';
beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-pictures-overlays-drawn-open-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  unbuilt = await installRealBaseThemes(cwd, ['butter']);
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug */
const shown = async slug =>
  /** @type {any} */ (await themeEditShow(slug, {cwd})).data;
/** @param {Array<{part: string, state?: string}>} list */
const named = list => list.map(m => `${m.part}${m.state ? `:${m.state}` : ''}`);
/** Follow a line as printed, each `&&` step. @param {string} line */
async function follow(line) {
  for (const step of line.split(' && ')) {
    const args = splitCommand(step.slice(step.indexOf('experimental ')));
    if (!args) throw new Error(`cannot read ${step}`);
    const r = await runCli(args, {cwd});
    expect(r.status, `${step}\n${r.stderr}`).toBe(0);
  }
}

describe('pictures', () => {
  it('run each opening animation to its end before the picture', () => {
    const dir = path.resolve(import.meta.dirname, '../../foundation/render');
    expect(
      fs.readFileSync(path.join(dir, 'picture-chrome.mjs'), 'utf8'),
    ).toMatch(/document\.getAnimations\(\)[\s\S]*a\.finish\(\)/);
    expect(
      fs.readFileSync(path.join(dir, 'picture-playwright.mjs'), 'utf8'),
    ).toContain("animations: 'disabled'");
  });
});

describe('missed', () => {
  it(
    'a change that changes nothing counts what the theme still misses',
    async () => {
      await themeEditNew('n', {cwd, like: 'neutral'});
      const first = /** @type {any} */ (
        await themeEditSet('n', 'accent', '#0b6e4f', {cwd})
      ).data.missed;
      expect(first).toBeGreaterThan(0);
      const again = /** @type {any} */ (
        await themeEditSet('n', 'accent', '#0b6e4f', {cwd})
      ).data.missed;
      expect(again).toBe(first);
    },
    T,
  );

  it(
    "judges butter's selected nav item by butter's own rule",
    async () => {
      if (unbuilt) return;
      await themeEditNew('b', {cwd, like: 'butter'});
      await themeEditSet('b', 'corners', 'square', {cwd});
      const d = await shown('b');
      expect(
        d.openProblems.some((/** @type {any} */ p) =>
          /top-nav-item/.test(p.problem),
        ),
      ).toBe(false);
      await themeEditSet('b', 'accent', '#0b6e4f', {cwd});
      expect(named((await shown('b')).missed)).not.toContain(
        'top-nav-item:selected',
      );
    },
    T,
  );

  it(
    'an inverted surface lost in the page gets a line that makes it stand out',
    async () => {
      await themeEditNew('i', {cwd, like: 'neutral'});
      await themeEditSet('i', '--color-background-body', '#151515', {
        cwd,
        mode: 'light',
      });
      const list = (await shown('i')).missed;
      expect(named(list)).toEqual(expect.arrayContaining(['toast', 'tooltip']));
      for (const part of ['toast', 'tooltip']) {
        const m = list.find((/** @type {any} */ x) => x.part === part);
        expect(m.line).toMatch(/ set i /);
        await follow(m.line);
      }
      const after = await shown('i');
      expect(named(after.missed)).not.toContain('toast');
      expect(named(after.missed)).not.toContain('tooltip');
      expect(
        after.openProblems.some((/** @type {any} */ p) =>
          /\b(toast|tooltip)\b/.test(p.problem),
        ),
      ).toBe(false);
    },
    T,
  );

  it(
    'a border line frames only the variants that draw a box',
    async () => {
      await themeEditNew('w', {cwd, like: 'neutral'});
      await themeEditSet('w', '--border-width', '2px', {cwd});
      const m = (await shown('w')).missed.find(
        (/** @type {any} */ x) => x.part === 'button',
      );
      if (!m) return;
      expect(m.line).toMatch(/--when variant:primary/);
      expect(m.line).not.toMatch(/variant:ghost/);
      await follow(m.line);
      const saved = JSON.parse(
        fs.readFileSync(path.join(cwd, 'themes/w/w.settings.json'), 'utf8'),
      ).settings.filter((/** @type {any} */ s) => s.on === 'button');
      expect(saved.length).toBeGreaterThan(0);
      expect(saved.every((/** @type {any} */ s) => s.when)).toBe(true);
    },
    T,
  );

  it(
    "with the theme's own corners at a pill, no pill is missed",
    async () => {
      await themeEditNew('p', {cwd, like: 'neutral'});
      const r = /** @type {any} */ (
        await themeEditSet('p', 'corners', 'pill', {cwd})
      ).data;
      expect(r.missed ?? 0).toBe(0);
      expect(
        (await shown('p')).missed.some((/** @type {any} */ x) =>
          /full pill/.test(x.why),
        ),
      ).toBe(false);
      const text = (await runCli([...ED, 'set', 'p', 'corners', 'pill'], {cwd}))
        .stdout;
      expect(text).not.toMatch(/^missed:/m);
    },
    T,
  );
});
