// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file An undo in `editor how` that says a mode, on a theme that saves the
 * setting: it takes back the setting saved for that mode only, names a
 * setting saved the same for both modes, and takes back a change said
 * earlier in the same ask before any saved setting.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;
/** Why a bundled base could not be installed here, when one could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-how-undo-mode-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  for (const t of ['ml', 'md', 'mb', 'mc', 'mx', 'mh'])
    await themeEditNew(t, {cwd, like: 'neutral'});
  await themeEditSet('ml', '--color-accent', '#0f766e', {cwd, mode: 'light'});
  await themeEditSet('md', '--color-accent', '#0f766e', {cwd, mode: 'dark'});
  await themeEditSet('mb', '--color-accent', '#0f766e', {cwd});
  await themeEditSet('mx', '--color-accent', '#0f766e', {cwd});
  await themeEditSet('mh', 'font-weight', '700', {cwd, on: 'heading'});
  await themeEditSet('mx', '--color-accent', '#7c3aed', {cwd, mode: 'dark'});
  await themeEditSet('mc', 'background-color', '#eeeeee', {
    cwd,
    on: 'card',
    mode: 'light',
  });
  await themeEditSet('mc', 'background-color', '#222222', {
    cwd,
    on: 'card',
    mode: 'dark',
  });
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/**
 * Every set and undo line the answers give, and every result's text.
 * @param {string} theme @param {string} q
 */
const answer = async (theme, q) => {
  const {data} = await themeEditHow(q, {cwd, theme});
  const results = /** @type {Array<{text: string, commands: string[]}>} */ (
    data.results ?? []
  );
  return {
    lines: [
      ...new Set(
        results.flatMap(r =>
          r.commands
            .filter(c => / editor (?:set|undo) /.test(c))
            .map(c => c.replace(/^.* editor (set|undo) \S+ /, '$1 ')),
        ),
      ),
    ],
    text: results.map(r => r.text).join('\n'),
  };
};

/**
 * @typedef {{theme: string, q: string, lines?: string[], never?: RegExp, says?: RegExp}} Row
 * @type {Array<[string, Row]>}
 */
const ROWS = [
  [
    'a change said in the ask is taken back before a saved setting',
    {
      theme: 'ml',
      q: 'make the accent red in light mode. undo the light mode accent change',
      lines: [],
      says: /taken back by its undo/,
    },
  ],
  [
    'also when the saved setting is for the other mode',
    {
      theme: 'md',
      q: 'make the accent red in light mode. undo the light mode accent change',
      lines: [],
    },
  ],
  [
    'also when the saved setting is for both modes',
    {
      theme: 'mb',
      q: 'make the accent red in light mode. undo the light mode accent change',
      lines: [],
    },
  ],
  [
    'an undo that says no mode takes back a change said in the ask too',
    {
      theme: 'mb',
      q: 'make the accent red. reset the accent',
      lines: [],
      says: /taken back by its undo/,
    },
  ],
  [
    'each change an undo names takes back the change said, not the saved setting',
    {
      theme: 'mc',
      q: 'make the cards blue. undo the card change and the heading change',
      lines: [],
      says: /the card change said earlier in this ask is taken back/,
    },
  ],
  [
    'an undo of one mode beside a setting for both modes and the other mode',
    {
      theme: 'mx',
      q: 'undo the light mode accent change',
      lines: [],
      says: /for both modes, and for dark mode on its own/,
    },
  ],
  [
    'an undo of a mode with its own setting says what that mode falls back to',
    {
      theme: 'mx',
      q: 'in dark mode, reset the accent',
      lines: ['undo --color-accent --mode dark'],
      says: /dark mode then uses what mx sets for both modes/,
    },
  ],
  [
    'a clash said after the undo keeps its choice and the saved undo',
    {
      theme: 'mc',
      q: 'reset the card background. make the cards red. make the cards blue',
      says: /contradict each other/,
    },
  ],
  [
    "a clash taken back takes the undo's saved lines with it",
    {
      theme: 'mc',
      q: 'make the headings bold. make the cards red. make the cards blue. reset the card background',
      never: /^undo /,
      says: /which clash, are taken back/,
    },
  ],
  [
    'an undo of a look with no change of it said keeps the saved undo',
    {
      theme: 'mh',
      q: 'make the headings bold. undo the heading size change',
      says: /take back what mh sets/,
    },
  ],
  [
    'an undo that says a mode takes back the setting saved for that mode',
    {
      theme: 'ml',
      q: 'undo the light mode accent change',
      lines: ['undo --color-accent --mode light'],
    },
  ],
  [
    'nothing saved for that mode: nothing is taken back, and the answer says so',
    {
      theme: 'md',
      q: 'undo the light mode accent change',
      lines: [],
      says: /sets nothing for accent in light mode/,
    },
  ],
  [
    'a setting saved the same for both modes is named, with how to take it back',
    {
      theme: 'mb',
      q: 'undo the light mode accent change',
      lines: [],
      says: /sets accent for both modes, so an undo of light mode alone takes nothing back; an undo that names no mode takes it back/,
    },
  ],
  [
    'a mode said before the undo is read, also when nothing is taken back',
    {
      theme: 'mb',
      q: 'in dark mode, reset the accent',
      lines: [],
      says: /^(?![\s\S]*not used)/,
    },
  ],
  [
    'an undo that says no mode takes back both',
    {
      theme: 'mc',
      q: 'reset the card background',
      lines: [
        'undo background-color --on card --mode light',
        'undo background-color --on card --mode dark',
      ],
    },
  ],
  ...[
    'in dark mode, reset the card background',
    'reset the card background, in dark mode',
    'reset the card background, dark mode only',
    'in dark mode: reset the card background',
    'reset the dark mode card background',
  ].map(
    q =>
      /** @type {[string, Row]} */ ([
        `a mode said with the undo: ${q}`,
        {
          theme: 'mc',
          q,
          lines: ['undo background-color --on card --mode dark'],
        },
      ]),
  ),
];

describe('an undo that says a mode, on a theme that saves the setting', () => {
  it.each(ROWS)(
    '%s',
    async (_name, row, test) => {
      if (unbuilt) {
        console.warn(`skipped: ${unbuilt}`);
        test.skip();
      }
      const r = await answer(row.theme, row.q);
      if (row.lines) expect(r.lines, row.q).toEqual(row.lines);
      if (row.never)
        for (const line of r.lines) expect(line, row.q).not.toMatch(row.never);
      if (row.says) expect(r.text, row.q).toMatch(row.says);
    },
    300_000,
  );
});
