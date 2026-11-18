// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Input the editor prints or saves, pasted or read back, gets the
 * repairs typed input gets: a printed setting or change line and a
 * declaration carry their own setting and value; a braceless entry, one
 * named under `setting`, and its `only` read by the one yes/no reader; a
 * saved mode read by the typed --mode reader; a saved token in another
 * form; a spaced setting name quoted in lines; a swapped setting and value
 * beside a scope typo; a light or dark color name on new; and a dash-led
 * option value on new.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;
const T = 240_000;
const BIN = path.resolve(
  import.meta.dirname,
  '../../clients/cli/bin/astryx.mjs',
);

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt177-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** The commands a refusal offers, after the editor's prefix. @param {any} e */
const lines = e =>
  e.run.map((/** @type {string} */ x) => x.replace(/^.* editor /, ''));

/** @param {string} thing @param {string} value @param {Record<string, any>} [options] */
const setRefused = async (thing, value, options = {}) =>
  lines(
    await refusal(() => themeEditSet('t', thing, value, {cwd, ...options})),
  );

/** The theme's settings file with these entries. @param {any[]} settings */
const saveSettings = settings => {
  const file = path.join(cwd, 'themes/t/t.settings.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, JSON.stringify({...data, settings}, null, 2));
};

describe('a printed line or a declaration pasted back', () => {
  it(
    'carries the setting and value read from it into its repairs',
    async () => {
      expect(await setRefused('padding = 8 px on card', '')).toContain(
        'set t padding 8px --on card',
      );
      expect(
        await setRefused('aspect-ratio: 16,9', '', {on: 'card'}),
      ).toContain("set t aspect-ratio '16 / 9' --on card");
      expect(await setRefused('z-index: 1,000', '', {on: 'card'})).toContain(
        'set t z-index 1000 --on card',
      );
      expect(await setRefused('accent = tomatoe (whole theme)', '')).toContain(
        'set t accent tomato',
      );
    },
    T,
  );

  it(
    "reads the editor's own change line as the value it changed to",
    async () => {
      await themeEditSet('t', 'corners pill -> round', '', {cwd});
      await themeEditSet('t', '--radius-element: 0.5rem -> 0px', '', {cwd});
      const saved = JSON.parse(
        fs.readFileSync(path.join(cwd, 'themes/t/t.settings.json'), 'utf8'),
      ).settings;
      expect(saved).toContainEqual(
        expect.objectContaining({thing: 'corners', value: 'round'}),
      );
      expect(saved).toContainEqual(
        expect.objectContaining({thing: '--radius-element', value: '0px'}),
      );
      saveSettings([]);
    },
    T,
  );
});

describe('a pasted entry', () => {
  it(
    'is read without its braces, under `setting`, and with its only read as yes or no',
    async () => {
      expect(await setRefused('"thing":"corners","value":"pill"', '')).toEqual([
        'set t corners pill',
      ]);
      expect(await setRefused('"padding": "8px", "on": "card"', '')).toEqual([
        'set t padding 8px --on card',
      ]);
      expect(
        await setRefused('{"setting":"accent","value":"red"}', ''),
      ).toEqual(['set t accent red']);
      for (const no of ['no', 'false', '0'])
        expect(
          await setRefused(
            `{"padding":"8px","on":"text-input","only":"${no}"}`,
            '',
          ),
        ).toEqual(['set t padding 8px --on text-input']);
      const maybe = await refusal(() =>
        themeEditSet(
          't',
          '{"padding":"8px","on":"text-input","only":"maybe"}',
          '',
          {cwd},
        ),
      );
      expect(maybe.message).toContain('reads as neither yes nor no');
      expect(lines(maybe).join(' ')).not.toContain('--only');
    },
    T,
  );
});

describe('a spaced setting name and a swapped order beside a scope typo', () => {
  it(
    'keeps the repair, the name quoted, and reads the swap',
    async () => {
      expect(
        await setRefused('background color', 'red', {on: 'crad'}),
      ).toContain("set t 'background color' red --on card");
      const swapped = await setRefused('red', 'background-color', {on: 'crad'});
      expect(swapped[0]).toBe('set t background-color red --on card');
      expect(swapped).not.toContain('how red');
    },
    T,
  );
});

describe('saved entries', () => {
  it(
    'reads a saved mode by the typed --mode reader beside the undo',
    async () => {
      saveSettings([
        {thing: '--color-accent', value: 'red', source: 'token', mode: 'darkk'},
      ]);
      const shown = lines(await refusal(() => themeEditShow('t', {cwd})));
      expect(shown[0]).toBe('undo t --color-accent');
      expect(shown).toContain('set t --color-accent red --mode dark');
      // A mode that names both modes or none is no mode, as --mode both is
      // read typed: the setting loads for both modes.
      for (const mode of ['both', '']) {
        saveSettings([
          {thing: '--color-accent', value: 'red', source: 'token', mode},
        ]);
        const r = await themeEditShow('t', {cwd});
        const read = r.data.settings.find(
          (/** @type {any} */ x) => x.thing === '--color-accent',
        );
        expect(read, mode).toMatchObject({value: 'red', source: 'token'});
        expect(read.mode, mode).toBeUndefined();
      }
      saveSettings([]);
    },
    T,
  );

  it(
    'reads a token saved in var() form as that token',
    async () => {
      saveSettings([{thing: 'var(--color-accent)', value: 'red'}]);
      const r = await themeEditShow('t', {cwd});
      expect(r.data.settings).toContainEqual(
        expect.objectContaining({thing: '--color-accent', source: 'token'}),
      );
      saveSettings([]);
    },
    T,
  );
});

describe('new', () => {
  it(
    'offers a light or dark color name as the one color, never a line without it',
    async () => {
      const e = await refusal(() =>
        themeEditNew('y6', {
          cwd,
          like: 'neutral',
          settings: {accent: 'light blue'},
        }),
      );
      expect(lines(e)).toContain('new y6 --like neutral --accent lightblue');
      expect(lines(e)).not.toContain('new y6 --like neutral');
    },
    T,
  );

  it(
    'reads a dash-led word after a value option as its value',
    () => {
      const r = spawnSync(
        process.execPath,
        [
          BIN,
          'experimental',
          'theme',
          'editor',
          'new',
          'y1',
          '--like',
          'neutral',
          '--font',
          '-apple-system',
        ],
        {cwd, encoding: 'utf8', timeout: 120_000},
      );
      expect(r.stdout + r.stderr).not.toContain('was given no value');
      const saved = JSON.parse(
        fs.readFileSync(path.join(cwd, 'themes/y1/y1.settings.json'), 'utf8'),
      );
      expect(saved.settings).toContainEqual(
        expect.objectContaining({thing: 'font', value: '-apple-system'}),
      );
    },
    T,
  );
});
