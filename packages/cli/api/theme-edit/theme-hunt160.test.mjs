// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The hundred-and-sixtieth pass, input readers: a comma between two
 * whole numbers of a ratio is the pair and a decimal-looking one the
 * decimal; words after a dial's value in an unquoted `new` stay in that
 * value; a part typo that lands on a part name keeps that name; a pasted
 * entry's extra key is left out, and said; a headings half set beside a
 * damaged entry is a second step; a base given as a path to its package is
 * that base, a line on no base says so, and the typed value is echoed as
 * typed; a dial name saved in a typed form is that dial; show and compile
 * give saved damage the lines set gives.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

/** @type {string} */
let cwd;
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt160-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, 240_000);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

const P = 'astryx experimental theme editor';
const settingsFile = () => path.join(cwd, 'themes/t/t.settings.json');
/** @param {(d: any) => void} fn */
const editSaved = fn => {
  const d = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
  fn(d);
  fs.writeFileSync(settingsFile(), JSON.stringify(d, null, 2));
};
/** @param {() => unknown} run */
async function refusal(run) {
  try {
    await run();
  } catch (e) {
    return /** @type {any} */ (e);
  }
  throw new Error('expected a refusal');
}
const lines = (/** @type {any} */ e) =>
  (e.suggestions ?? []).map((/** @type {any} */ s) => [s.name, s.reason]);
/** The CLI's --json answer in the fixture. @param {string[]} args */
const cli = async args =>
  JSON.parse((await runCli([...args, '--json'], {cwd})).stdout);

describe('aspect-ratio commas', () => {
  it.each([
    ['16,9', "'16 / 9'"],
    ['4,3', "'4 / 3'"],
    ['16,10', "'16 / 10'"],
    ['16, 9', "'16 / 9'"],
    ['1,78', '1.78'],
    ['2,35', '2.35'],
  ])(
    '%s is %s',
    async (typed, meant) => {
      const e = await refusal(() =>
        themeEditSet('t', 'aspect-ratio', typed, {cwd, on: 'card'}),
      );
      expect(lines(e)[0][0]).toBe(`${P} set t aspect-ratio ${meant} --on card`);
    },
    120_000,
  );
});

describe('part typos', () => {
  it('a typo of a part name keeps that name', async () => {
    const e = await refusal(() =>
      themeEditSet('t', 'background-color', 'red', {cwd, on: 'tabel'}),
    );
    expect(lines(e)[0][0]).toMatch(/--on table$/);
    const g = await refusal(() =>
      themeEditSet('t', 'background-color', 'red', {cwd, on: 'mneus'}),
    );
    expect(lines(g)[0][0]).toMatch(/--on menus$/);
  }, 120_000);
});

describe('pasted entries', () => {
  it('an extra key beside the saved form is left out, and said', async () => {
    const e = await refusal(() =>
      themeEditSet(
        't',
        '{"thing":"accent","value":"red","source":"dial","comment":"x"}',
        undefined,
        {cwd},
      ),
    );
    expect(e.message).toContain('"comment" is no field the editor reads');
    expect(lines(e).map((/** @type {any} */ x) => x[0])).toEqual([
      `${P} set t accent red`,
    ]);
  }, 120_000);
});

describe('saved damage', () => {
  it('a headings half beside a damaged headings entry is a second step', async () => {
    editSaved(d => {
      d.settings = [{thing: 'headings', value: 'Bold, Tight', source: 'dial'}];
    });
    try {
      const e = await refusal(() =>
        themeEditSet('t', '--spacing-4', '12px', {cwd}),
      );
      const reason = (/** @type {string} */ n) =>
        lines(e).find((/** @type {any} */ x) => x[0] === n)?.[1];
      expect(reason(`${P} set t headings bold`)).toBe(
        'or set the value it holds, as set reads it',
      );
      expect(reason(`${P} set t headings tight`)).toMatch(/^then this/);
    } finally {
      editSaved(d => {
        d.settings = [];
      });
    }
  }, 240_000);

  it('a dial name saved in a typed form is that dial', async () => {
    editSaved(d => {
      d.settings = [{thing: 'Text Size', value: 'large', source: 'dial'}];
    });
    try {
      await themeEditShow('t', {cwd});
    } finally {
      editSaved(d => {
        d.settings = [];
      });
    }
  }, 240_000);

  it('show and compile give the lines set gives', async () => {
    editSaved(d => {
      d.settings = [
        {thing: 'padding', value: '8 px', source: 'property', on: 'card'},
      ];
    });
    try {
      const set = lines(
        await refusal(() => themeEditSet('t', '--spacing-4', '12px', {cwd})),
      );
      const show = lines(await refusal(() => themeEditShow('t', {cwd})));
      expect(show).toEqual(set);
      expect(set.map((/** @type {any} */ x) => x[0])).toContain(
        `${P} set t padding 8px --on card`,
      );
      const compiled = await cli([
        'experimental',
        'theme',
        'compile',
        'themes/t/t.theme.ts',
      ]);
      expect(
        compiled.suggestions.map((/** @type {any} */ s) => s.name),
      ).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/undo t padding --on card$/),
          expect.stringMatching(/set t padding 8px --on card$/),
        ]),
      );
    } finally {
      editSaved(d => {
        d.settings = [];
      });
    }
  }, 240_000);
});

describe('new', () => {
  it('a base given as a path to its package is that base', async () => {
    const r = await themeEditNew('p1', {
      cwd,
      like: './node_modules/@astryxdesign/theme-neutral',
    });
    expect(/** @type {any} */ (r).data.like).toBe('neutral');
  }, 240_000);

  it('a line on no base says so, and the base is echoed as typed', async () => {
    const e = await refusal(() =>
      themeEditNew('p2', {cwd, like: './node_modules/my_theme'}),
    );
    expect(e.message).toContain('not "./node_modules/my_theme"');
    expect(lines(e)).toContainEqual([`${P} new p2`, 'build on no theme']);
  }, 120_000);

  it('words after a dial value stay in it, and the typed name stays', async () => {
    const mode = await cli([
      'experimental',
      'theme',
      'editor',
      'new',
      'z7',
      '--like',
      'neutral',
      '--mode',
      'Dark',
      'Only',
    ]);
    expect(mode.suggestions[0].name).toMatch(
      /new z7 --like neutral --mode dark-only$/,
    );
    const font = await cli([
      'experimental',
      'theme',
      'editor',
      'new',
      '--font',
      'Open',
      'Sans',
      '--like',
      'neutral',
      'my-theme',
    ]);
    expect(font.suggestions[0].name).toMatch(
      /new my-theme --like neutral --font 'Open Sans'$/,
    );
  }, 240_000);
});
