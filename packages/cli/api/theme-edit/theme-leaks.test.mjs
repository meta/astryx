// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A button color that also paints the toast's close button is
 * measured on the toast's own fill and named plainly (no setting keeps the
 * toast's buttons apart), with the nearest button color that reads on
 * every toast fill and on the page when there is one; and text on a pane the theme painted (a side
 * nav's dark fill) is measured on that fill, while the same text shown on
 * another pane that holds it unpainted (the mobile nav drawer) is fixed by
 * painting that pane, never by recoloring the text everywhere.
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

const T = 400_000;
/** @type {string} */
let cwd;
// (Show's open problems and missed list come from the theme, not from the
// sheet it writes: one small section of the sheet is drawn, not all of it.)
const looked = () => ({cwd, section: 'actions'});
beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-leaks-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
});
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/**
 * Follow a line; the problems the theme has after it, as text.
 * @param {string} line
 * @returns {Promise<string[]>}
 */
async function follow(line) {
  const args = splitCommand(line.slice(line.indexOf('experimental ')));
  const r = await runCli([.../** @type {string[]} */ (args), '--json'], {cwd});
  expect(r.status, `${line}\n${r.stderr}`).toBe(0);
  return JSON.parse(r.stdout).data.problems ?? [];
}
/** @param {string} slug */
const open = async slug =>
  /** @type {Array<{problem: string, fix: string | null}>} */ (
    /** @type {any} */ (await themeEditShow(slug, looked())).data.openProblems
  );

describe("a button color on the toast's close button", () => {
  it(
    'is measured on the toast fill and named, with a color that reads there and on the page',
    async () => {
      await themeEditNew('b', {cwd, like: 'neutral'});
      const r = /** @type {any} */ (
        await themeEditSet('b', 'color', '#2563eb', {
          cwd,
          on: 'button',
          when: 'variant:ghost',
        })
      ).data;
      const leaks = r.newProblems.filter((/** @type {any} */ p) =>
        /also paints the close button in toast/.test(p.problem),
      );
      expect(leaks.length).toBeGreaterThan(0);
      for (const p of leaks)
        expect(p.problem).toMatch(/no setting keeps the toast's buttons apart/);
      // A line only when one button color reads on every toast fill and
      // on the page; else the problem says no one color does.
      for (const p of leaks)
        if (p.fix)
          expect(p.fix).toMatch(
            /color '#[0-9a-f]{6}' --on button --when variant:ghost/,
          );
        else
          expect(p.problem).toMatch(/no one button color reads on every toast/);
    },
    T,
  );
});

describe('text on a pane the theme painted', () => {
  it(
    'reads on that pane, and the unpainted drawer is painted to match',
    async () => {
      await themeEditNew('n', {cwd, like: 'neutral'});
      await themeEditSet('n', 'background-color', '#4a154b', {
        cwd,
        on: 'side-nav',
      });
      await themeEditSet('n', 'color', '#ffffffcc', {cwd, on: 'side-nav-item'});
      const first = await open('n');
      // Not measured on the app shell's surface the pane covers.
      expect(
        first.filter(p => /side-nav-item.*on app-shell's/.test(p.problem)),
      ).toEqual([]);
      for (const p of first.filter(x => /side-nav-item/.test(x.problem)))
        expect(p.fix ?? '').not.toMatch(/--on side-nav-item/);
      let left = first;
      for (let i = 0; i < 6 && left.some(p => p.fix); i++) {
        await follow(/** @type {string} */ (left.find(p => p.fix)?.fix));
        left = await open('n');
      }
      expect(left).toEqual([]);
    },
    T,
  );
});

describe('text on a fill its part draws only in a state', () => {
  it(
    'gets a line for that state, which set takes and which ends it',
    async () => {
      await themeEditNew('h', {
        cwd,
        like: 'neutral',
        settings: {accent: '#1f4d3a', neutral: '#b8a283'},
      });
      await themeEditSet('h', '--color-text-secondary', '#b8a486', {
        cwd,
        mode: 'dark',
      });
      let left = await open('h');
      for (const p of left.filter(x => /text in item/.test(x.problem)))
        expect(p.fix ?? '').not.toMatch(/--when selected/);
      const item = (/** @type {string} */ x) => /text in item/.test(x);
      let items = left.map(p => p.problem).filter(item);
      for (let i = 0; i < 6 && items.length && left.some(p => p.fix); i++) {
        items = (
          await follow(/** @type {string} */ (left.find(p => p.fix)?.fix))
        ).filter(item);
        if (items.length) left = await open('h');
      }
      expect(items).toEqual([]);
    },
    T,
  );
});

describe('a radius your own theme source sets on a part', () => {
  it(
    'is named when a radius setting there would not show',
    async () => {
      // (On the toast case's theme: its source gains a radius of its own.)
      const src = path.join(cwd, 'themes/b/b.theme.ts');
      fs.writeFileSync(
        src,
        fs
          .readFileSync(src, 'utf8')
          .replace(
            /name: 'b',/,
            "name: 'b',\n  components: {button: {base: {borderRadius: '2px'}}},",
          ),
      );
      const r = /** @type {any} */ (
        await themeEditSet('b', 'border-radius', '12px', {cwd, on: 'button'})
      ).data;
      expect(r.notes.join('\n')).toMatch(
        /b\.theme\.ts sets border-radius on button itself \(2px\)/,
      );
    },
    T,
  );
});
