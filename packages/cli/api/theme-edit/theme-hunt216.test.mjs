// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A contrast fix keeps the scope of the change it answers: after a
 * setting with --only, its line carries --only, so following it changes
 * the part named alone. An input's typed text (its value) is measured on
 * the input's fill like any other text, with a fix line that works.
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

const T = 240_000;
/** @type {string} */
let cwd;
/** @type {string} */
let unbuilt = '';
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt216-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  unbuilt = await installRealBaseThemes(cwd, ['butter']);
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** Follow a printed line. @param {string} line */
async function follow(line) {
  const args = splitCommand(line.slice(line.indexOf('experimental ')));
  if (!args) throw new Error(`cannot read ${line}`);
  const r = await runCli(args, {cwd});
  expect(r.status, `${line}\n${r.stderr}`).toBe(0);
}
/** @param {string} slug */
const saved = slug =>
  /** @type {Array<any>} */ (
    JSON.parse(
      fs.readFileSync(
        path.join(cwd, `themes/${slug}/${slug}.settings.json`),
        'utf8',
      ),
    ).settings
  );
/** @param {any} r @param {RegExp} about */
const fixFor = (r, about) =>
  /** @type {string} */ (
    r.data.newProblems.find((/** @type {any} */ p) => about.test(p.problem))
      ?.fix
  );

describe('a fix after a setting with --only', () => {
  it(
    'keeps --only on a border fix, and changes the part alone',
    async () => {
      await themeEditNew('b', {cwd, like: 'neutral'});
      const r = await themeEditSet('b', 'border-color', '#262626', {
        cwd,
        on: 'text-input',
        only: true,
        mode: 'dark',
      });
      const fix = fixFor(r, /border on text-input/);
      expect(fix).toMatch(/--on text-input --only --mode dark$/);
      await follow(fix);
      const entries = saved('b').filter(s => s.thing === 'border-color');
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({on: 'text-input', only: true});
      expect(
        /** @type {any} */ (await themeEditShow('b', {cwd})).data.openProblems,
      ).toEqual([]);
    },
    T,
  );

  it(
    'keeps --only on a text fix, and changes the part alone',
    async () => {
      await themeEditNew('a', {cwd, like: 'neutral'});
      const r = await themeEditSet('a', 'background-color', '#000', {
        cwd,
        on: 'text-area',
        only: true,
      });
      const fix = fixFor(r, /text-area/);
      expect(fix).toMatch(/--on text-area(-control)? --only/);
      await follow(fix);
      expect(
        saved('a').every(s => !s.on || s.only),
        JSON.stringify(saved('a')),
      ).toBe(true);
      expect(
        /** @type {any} */ (await themeEditShow('a', {cwd})).data.openProblems,
      ).toEqual([]);
    },
    T,
  );
});

describe("an input's typed text", () => {
  it.each(['text-input', 'number-input'])(
    'is measured on the %s fill, and its fix line works',
    async part => {
      const slug = part === 'text-input' ? 'i' : 'n';
      await themeEditNew(slug, {cwd, like: 'neutral'});
      const r = await themeEditSet(slug, 'background-color', '#000', {
        cwd,
        on: part,
        only: true,
      });
      const fix = fixFor(r, new RegExp(`text in ${part} `));
      expect(fix).toBeTruthy();
      await follow(fix);
      expect(
        /** @type {any} */ (await themeEditShow(slug, {cwd})).data.openProblems,
      ).toEqual([]);
    },
    T,
  );
});

/** @param {string} slug */
const open = async slug =>
  /** @type {Array<{problem: string, fix: string | null}>} */ (
    /** @type {any} */ (await themeEditShow(slug, {cwd})).data.openProblems
  );

describe('text on a ground part whose variants differ', () => {
  it('is fixed per variant, and following every fix never undoes another', async () => {
    await themeEditNew('h', {cwd, like: 'neutral'});
    await themeEditSet('h', '--color-background-body', '#151515', {
      cwd,
      mode: 'light',
    });
    const first = await open('h');
    const heading = first.find(p =>
      /top-nav-heading \(on app-shell-header, variant wash\)/.test(p.problem),
    );
    expect(heading?.fix).toMatch(/--on app-shell-header --when variant:wash/);
    // Follow each offered fix in turn: the open problems only go down, and
    // what is left has no line (no single change fixes it).
    let before = first.length;
    for (let i = 0; i < 30; i++) {
      const now = await open('h');
      expect(now.length).toBeLessThanOrEqual(before);
      before = now.length;
      const next = now.find(p => p.fix);
      if (!next) break;
      await follow(/** @type {string} */ (next.fix));
    }
    expect((await open('h')).every(p => !p.fix)).toBe(true);
  }, 600_000);

  it(
    "measures butter's own text color, and offers no line that changes nothing",
    async () => {
      if (unbuilt) return;
      await themeEditNew('bt', {cwd, like: 'butter'});
      await themeEditSet('bt', '--color-background-body', '#101010', {
        cwd,
        mode: 'light',
      });
      const item = (await open('bt')).filter(p =>
        /top-nav-item \(on app-shell-header/.test(p.problem),
      );
      expect(item.length).toBeGreaterThan(0);
      for (const p of item) {
        expect(p.problem).toMatch(/#225bff/i);
        expect(p.fix ?? '').not.toMatch(/--on app-shell-header/);
      }
    },
    T,
  );
});

describe('missed', () => {
  it('never offers a line set refuses, nor a question', async () => {
    await themeEditNew('m', {cwd, like: 'neutral'});
    await themeEditSet('m', '--border-width', '2px', {cwd});
    const list = /** @type {any} */ (await themeEditShow('m', {cwd})).data
      .missed;
    for (const x of list) {
      expect(x.line).not.toMatch(/ how /);
      await follow(x.line.split(' && ')[0]);
    }
  }, 600_000);
});
