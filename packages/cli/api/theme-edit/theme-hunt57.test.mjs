// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The fifty-seventh pass: a saved entry written in a form the input
 * cleanup repairs (`Corners`, `var(--radius-element)`, `backgroundColor`,
 * state `Hover`, an em dash) is removed by the undo its refusal suggests,
 * and only that entry: a valid neighbor the cleaned name also matches
 * stays.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from './theme-edit.mjs';
import {normalValueText, normalizeEntry} from './_check.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt57-', FIXTURE_PACKAGES);
  await themeEditNew('b', {cwd});
}, 240_000);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

const file = () => path.join(cwd, 'themes/b/b.settings.json');

/** @param {() => Promise<unknown>} run */
async function refusal(run) {
  try {
    await run();
  } catch (error) {
    return /** @type {any} */ (error);
  }
  throw new Error('expected a refusal');
}

/**
 * Run a suggested `undo b <thing> [--flag value]…` through the API.
 * @param {string} line
 */
function undoFrom(line) {
  const words = [];
  const re = /'((?:[^']|'\\'')*)'|(\S+)/g;
  let m;
  const rest = line.slice(line.indexOf(' undo b ') + ' undo b '.length);
  while ((m = re.exec(rest)))
    words.push(m[1] != null ? m[1].replace(/'\\''/g, "'") : m[2]);
  const [thing, ...flags] = words;
  /** @type {Record<string, string>} */
  const opts = {};
  for (let i = 0; i < flags.length; i += 2)
    opts[flags[i].replace(/^--/, '')] = flags[i + 1];
  return themeEditUndo('b', {cwd, thing, ...opts});
}

const CASES = [
  [
    {thing: '--color-accent:', value: '#e11d48', source: 'token'},
    {thing: '--color-accent', value: '#2563eb', source: 'token'},
  ],
  [
    {thing: 'accent:', value: '#e11d48', source: 'dial'},
    {thing: 'accent', value: '#2563eb', source: 'dial'},
  ],
  // [the bad saved entry, a valid neighbor the cleaned name matches]
  [
    {thing: 'Corners', value: 'pill2', source: 'dial'},
    {thing: 'corners', value: 'pill', source: 'dial'},
  ],
  [
    {thing: 'var(--radius-element)', value: '3px', source: 'token'},
    {thing: '--radius-element', value: '6px', source: 'token'},
  ],
  [
    {thing: '\u2014radius-element', value: '3px', source: 'token'},
    {thing: '--radius-element', value: '6px', source: 'token'},
  ],
  [
    {
      thing: 'backgroundColor',
      value: '#fff',
      source: 'property',
      on: 'button',
    },
    {
      thing: 'background-color',
      value: '#000',
      source: 'property',
      on: 'button',
    },
  ],
  [
    {
      thing: 'opacity',
      value: '0.5',
      source: 'property',
      on: 'button',
      state: 'Hover',
    },
    {
      thing: 'opacity',
      value: '0.8',
      source: 'property',
      on: 'button',
      state: 'hover',
    },
  ],
];

describe('the suggested undo removes the exact saved entry', () => {
  it.each(CASES)(
    '%j',
    async (bad, good) => {
      const kept = fs.readFileSync(file(), 'utf8');
      const data = JSON.parse(kept);
      data.settings.push(good, bad);
      fs.writeFileSync(file(), JSON.stringify(data));
      try {
        const err = await refusal(() => themeEditShow('b', {cwd}));
        const line = (err.suggestions ?? [])
          .map((/** @type {any} */ x) => x.name)
          .find((/** @type {string} */ r) => / undo b /.test(r));
        expect(line, err.message).toBeTruthy();
        await undoFrom(line);
        const after = JSON.parse(fs.readFileSync(file(), 'utf8')).settings;
        // The bad entry is gone; the valid neighbor stays.
        expect(after).not.toContainEqual(bad);
        expect(after).toContainEqual(good);
        // And the theme takes commands again.
        await themeEditShow('b', {cwd});
      } finally {
        fs.writeFileSync(file(), kept);
      }
    },
    240_000,
  );
});

describe('a saved value with a thin space', () => {
  it('offers a set line only when set takes the clean value', async () => {
    const kept = fs.readFileSync(file(), 'utf8');
    const data = JSON.parse(kept);
    data.settings.push({
      thing: '--radius-element',
      value: '1\u20092px',
      source: 'token',
    });
    fs.writeFileSync(file(), JSON.stringify(data));
    try {
      const err = await refusal(() => themeEditShow('b', {cwd}));
      for (const r of /** @type {string[]} */ (err.suggestions ?? [])
        .map((/** @type {any} */ x) => x.name)
        .filter(x => / set b /.test(x)))
        expect(r).not.toMatch(/'1 2px'/);
      const undo = err.suggestions
        .map((/** @type {any} */ x) => x.name)
        .find((/** @type {string} */ r) => / undo b /.test(r));
      await undoFrom(undo);
      await themeEditShow('b', {cwd});
    } finally {
      fs.writeFileSync(file(), kept);
    }
  }, 240_000);
});

describe('N62: any run of dash-like characters starts a token', () => {
  it.each([
    '\u2014-color-accent',
    '\u2011\u2011color-accent',
    '\u2212color-accent',
    '\uFF0D\uFF0Dcolor-accent',
    '\u2013color-accent',
  ])(
    '%j',
    async typed => {
      expect(normalizeEntry(typed, '#123456').thing).toBe('--color-accent');
      await themeEditSet('b', typed, '#123456', {cwd});
      const saved = JSON.parse(fs.readFileSync(file(), 'utf8')).settings;
      expect(saved).toContainEqual(
        expect.objectContaining({thing: '--color-accent', value: '#123456'}),
      );
    },
    240_000,
  );

  it('plain hyphens are left as typed', () => {
    expect(normalizeEntry('---x', 'a').thing).toBe('---x');
  });
});

describe('N59/N63: quotes', () => {
  it.each([
    ['\u201COpen Sans\u201D, serif', '"Open Sans", serif'],
    ['\u2018Inter\u2019', "'Inter'"],
    ['"a\u00A0b" x\u00A0y', '"a\u00A0b" x y'],
  ])('%j reads as %j', (typed, want) => {
    expect(normalValueText(typed)).toBe(want);
  });

  it('a font family in curly quotes is saved with straight ones', async () => {
    await themeEditSet(
      'b',
      '--font-family-body',
      '\u201COpen Sans\u201D, serif',
      {cwd},
    );
    const saved = JSON.parse(fs.readFileSync(file(), 'utf8')).settings.find(
      (/** @type {any} */ x) => x.thing === '--font-family-body',
    );
    expect(saved.value).not.toMatch(/[\u201C\u201D]/);
    expect(saved.value).toContain('Open Sans');
  }, 240_000);
});
