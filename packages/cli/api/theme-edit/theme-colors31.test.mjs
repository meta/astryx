// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The twenty-eighth pass over `astryx experimental theme editor`: the
 * generic `math` family is a family, `how` steps an exact base text size the
 * dial cannot move, a hand-edited accent with no fixed opaque color is named,
 * readable values get the value meant as their suggestion, a loop through
 * the theme's own source is refused, and `show` names the tokens that source
 * takes from a dial.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditHow,
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from './theme-edit.mjs';
import {genericFamilies} from './_css.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-hunt28-', FIXTURE_PACKAGES);
  await themeEditNew('a', {cwd});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {() => Promise<unknown>} run */
async function refusal(run) {
  try {
    await run();
  } catch (error) {
    return /** @type {any} */ (error);
  }
  throw new Error('expected a refusal');
}

const dir = () => path.join(cwd, 'themes/a');

/**
 * Run with a token added to the theme's own source, then put it back.
 * @param {string} tokens the object's body
 * @param {() => Promise<void>} run
 */
async function withOwnTokens(tokens, run) {
  const ts = path.join(dir(), 'a.theme.ts');
  const kept = fs.readFileSync(ts, 'utf8');
  fs.writeFileSync(
    ts,
    kept.replace(/defineTheme\(\{/, `defineTheme({\n  tokens: {${tokens}},`),
  );
  try {
    await run();
  } finally {
    fs.writeFileSync(ts, kept);
  }
}

describe('N23: generic families come from the grammar', () => {
  it('lists math with the other generics', () => {
    expect(genericFamilies()).toEqual(
      expect.arrayContaining(['math', 'serif', 'fangsong', 'ui-rounded']),
    );
  });

  it('font math is accepted, not read as a size', async () => {
    const r = /** @type {any} */ (
      await themeEditSet('a', 'font', 'math', {cwd})
    );
    expect(JSON.stringify(r.data ?? r)).not.toContain('font-size');
    await themeEditUndo('a', {cwd});
  }, 240_000);
});

describe('N24: how steps an exact base text size', () => {
  it('offers the token, not the dial it masks', async () => {
    await themeEditSet('a', '--font-size-base', '14px', {cwd});
    try {
      const {data} = /** @type {any} */ (
        await themeEditHow('bigger text', {cwd, theme: 'a'})
      );
      const commands = data.results.flatMap(
        (/** @type {any} */ r) => r.commands,
      );
      expect(commands.join('\n')).toContain('--font-size-base 17.5px');
      expect(commands.join('\n')).not.toContain('text-size more');
    } finally {
      await themeEditUndo('a', {cwd});
    }
  }, 240_000);

  it('without the token, how still offers the dial', async () => {
    const {data} = /** @type {any} */ (
      await themeEditHow('bigger text', {cwd, theme: 'a'})
    );
    expect(JSON.stringify(data.results)).toContain('text-size');
  }, 240_000);
});

describe('N25: a hand-edited accent with no fixed opaque color', () => {
  it.each(['#2563ebcc', 'transparent', 'Canvas', 'var(--x)'])(
    'accent %s is named with the undo that removes it',
    async value => {
      await themeEditSet('a', 'accent', '#2563eb', {cwd});
      const file = path.join(dir(), 'a.settings.json');
      const j = JSON.parse(fs.readFileSync(file, 'utf8'));
      j.settings.find((/** @type {any} */ s) => s.thing === 'accent').value =
        value;
      fs.writeFileSync(file, JSON.stringify(j, null, 2));
      try {
        const err = await refusal(() =>
          themeEditSet('a', 'warning', '#f59e0b', {cwd}),
        );
        expect(err.code).toBe('ERR_THEME_INVALID');
        expect(err.message).toContain(`accent "${value}"`);
        expect(JSON.stringify(err.suggestions)).toContain('undo a accent');
      } finally {
        await themeEditUndo('a', {cwd, thing: 'accent'}).catch(() => {});
        const left = JSON.parse(fs.readFileSync(file, 'utf8'));
        left.settings = left.settings.filter(
          (/** @type {any} */ s) => s.thing !== 'accent',
        );
        fs.writeFileSync(file, JSON.stringify(left, null, 2));
      }
    },
    240_000,
  );
});

describe('N26: a readable value is suggested as meant', () => {
  it.each([
    ['text-size', '１８', 'text-size 18'],
    ['text-size', '18.', 'text-size 18'],
    ['--font-weight-bold', '７００', '--font-weight-bold 700'],
    ['--spacing-4', '４px', '--spacing-4 4px'],
    ['accent', '＃2563eb', "accent '#2563eb'"],
    ['accent', '#2563eb /* brand */', "accent '#2563eb'"],
  ])(
    '%s %s suggests %s',
    async (thing, value, meant) => {
      const err = await refusal(() => themeEditSet('a', thing, value, {cwd}));
      expect(JSON.stringify(err.suggestions)).toContain(`set a ${meant}`);
    },
    240_000,
  );
});

describe("R16-B: a loop through the theme's own source", () => {
  it('is refused, naming the source', async () => {
    await withOwnTokens(
      "'--radius-container': 'var(--radius-page)'",
      async () => {
        const err = await refusal(() =>
          themeEditSet('a', '--radius-page', 'var(--radius-container)', {cwd}),
        );
        expect(err.code).toBe('ERR_THEME_BAD_VALUE');
        expect(err.message).toContain(
          '--radius-page would read itself through --radius-container (set in a.theme.ts)',
        );
      },
    );
  }, 240_000);
});

describe('R15-B: show names the dial tokens the own source sets', () => {
  it('lists them in its notes', async () => {
    await themeEditSet('a', 'corners', 'pill', {cwd});
    try {
      await withOwnTokens("'--radius-element': '3px'", async () => {
        const r = /** @type {any} */ (await themeEditShow('a', {cwd}));
        expect(r.data.notes.join('\n')).toContain(
          'a.theme.ts sets --radius-element itself',
        );
        expect(r.data.notes.join('\n')).toContain('corners = pill');
      });
    } finally {
      await themeEditUndo('a', {cwd});
    }
  }, 240_000);
});
