// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Pasted forms read as typed ones: a var() token in other letters is
 * that token, a pasted entry with its setting and value in the other order
 * gets the typed pair's swap line, and a pasted object of several settings
 * gives each line its scope (the object's scope keys and the flags typed
 * with it). A change over a build that does not match the saved settings is
 * measured against the saved settings and says so. Every offered line is
 * followed.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditUndo} from './theme-edit.mjs';
import {readSetLine} from './_vet.mjs';
import {P} from './_tables.mjs';
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

const T = 240_000;
/** @type {string} */
let cwd;
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt206-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string[]} run */
const bare = run => run.map(r => r.replace(`${P} `, ''));

const settingsFile = () => path.join(cwd, 'themes/t/t.settings.json');
const saved = () => JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));

/**
 * Follows each offered set line in turn (each one taken, then stepped back).
 * @param {string[]} run
 */
async function followAll(run) {
  const lines = run.filter(l => l.startsWith(`${P} set t `));
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) {
    const read = readSetLine(line, 't');
    expect(read).not.toBeNull();
    const r = await themeEditSet('t', read.thing, read.value, {
      cwd,
      ...read.flags,
    });
    expect(r.data.theme).toBe('t');
    await themeEditUndo('t', {cwd});
  }
}

describe('a var() token in other letters', () => {
  it(
    'is that token, though siblings of its family are one letter away',
    async () => {
      const r = await refusal(() =>
        themeEditSet('t', 'padding', 'var(--Spacing-4)', {cwd, on: 'card'}),
      );
      expect(bare(r.run)).toContain(
        "set t padding 'var(--spacing-4)' --on card",
      );
      await followAll(r.run);
    },
    T,
  );
});

describe('a change over a stale build', () => {
  it(
    'says the build was not current and lists the token changes',
    async () => {
      await themeEditSet('t', 'accent', 'tomato', {cwd});
      // The setting removed by hand; the build left as it was.
      const data = saved();
      data.settings = data.settings.filter(
        (/** @type {any} */ s) => s.thing !== 'accent',
      );
      fs.writeFileSync(settingsFile(), `${JSON.stringify(data, null, 2)}\n`);
      const r = await themeEditSet('t', 'accent', 'tomato', {cwd});
      const notes = /** @type {string[]} */ (r.data.notes ?? []);
      expect(notes.join('\n')).toMatch(/the build was not current/);
      expect(notes.join('\n')).not.toMatch(/this changes nothing you see/);
      expect(r.data.changedTokens?.length).toBeGreaterThan(0);
      expect(
        saved().settings.some((/** @type {any} */ s) => s.thing === 'accent'),
      ).toBe(true);
      await themeEditUndo('t', {cwd});
    },
    T,
  );
});

describe('a pasted form with the setting and value in the other order', () => {
  it(
    'gets the swap line, as the typed pair does',
    async () => {
      for (const [thing, options, want] of /** @type {const} */ ([
        ['pill: corners', {}, 'set t corners pill'],
        [
          'red: background-color',
          {on: 'card'},
          'set t background-color red --on card',
        ],
        [
          '{"thing":"red","value":"background-color","on":"card"}',
          {},
          'set t background-color red --on card',
        ],
        [
          '{"red":"background-color","on":"card"}',
          {},
          'set t background-color red --on card',
        ],
      ])) {
        const r = await refusal(() =>
          themeEditSet('t', thing, '', {cwd, ...options}),
        );
        expect(bare(r.run)).toContain(want);
        expect(bare(r.run)).not.toContain('how red');
        await followAll(r.run);
      }
    },
    T,
  );
});

describe('a pasted object of several settings with scope keys', () => {
  it(
    'gives each setting the scope, and offers no scope key as a setting',
    async () => {
      const dark = await refusal(() =>
        themeEditSet(
          't',
          '{"--color-accent":"red","--color-text-primary":"blue","mode":"dark"}',
          '',
          {cwd},
        ),
      );
      expect(dark.message).toMatch(/holds 2 settings/);
      expect(bare(dark.run)).toEqual(
        expect.arrayContaining([
          'set t --color-accent red --mode dark',
          'set t --color-text-primary blue --mode dark',
        ]),
      );
      expect(dark.run.join('\n')).not.toMatch(/ mode dark-only/);
      await followAll(dark.run);
      const card = await refusal(() =>
        themeEditSet('t', '{"padding":"8px","margin":"4px","on":"card"}', '', {
          cwd,
        }),
      );
      expect(bare(card.run)).toEqual([
        'set t padding 8px --on card',
        'set t margin 4px --on card',
      ]);
      await followAll(card.run);
    },
    T,
  );
});

describe('a pasted object of several settings with flags typed', () => {
  it(
    'gives each setting the flags',
    async () => {
      const r = await refusal(() =>
        themeEditSet(
          't',
          '{"background-color":"red","border-radius":"4px"}',
          '',
          {cwd, on: 'card'},
        ),
      );
      expect(bare(r.run)).toEqual([
        'set t background-color red --on card',
        'set t border-radius 4px --on card',
      ]);
      await followAll(r.run);
      const hover = await refusal(() =>
        themeEditSet('t', '{"padding":"8px","margin":"4px"}', '', {
          cwd,
          on: 'card',
          state: 'hover',
        }),
      );
      expect(bare(hover.run)).toContain(
        'set t padding 8px --on card --state hover',
      );
      await followAll(hover.run);
    },
    T,
  );
});

describe('a pasted change line with a mode label and no old value', () => {
  it(
    'keeps the label as the mode',
    async () => {
      for (const [line, mode] of [
        ['--color-accent [light only] -> #7c3aed', 'light'],
        ['--color-accent (dark) -> #7c3aed', 'dark'],
      ]) {
        const r = await themeEditSet('t', line, '', {cwd});
        expect(r.data.theme).toBe('t');
        const entry = saved().settings.find(
          (/** @type {any} */ s) => s.thing === '--color-accent',
        );
        expect(entry?.mode).toBe(mode);
        await themeEditUndo('t', {cwd});
      }
    },
    T,
  );
});
