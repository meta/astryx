// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file new reads a setting typed after the name in the pair form with its
 * key in quotes or swapped (`"like": "neutral"`, `red=accent`,
 * `neutral=like`), never as name words or a value fuzzed into a color; and
 * the name typed as an option (`--theme t2`, `--theme=t2`) is that name.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

// The renders are stood in for: these tests are about the lines offered.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

const T = 240_000;
const ED = ['experimental', 'theme', 'editor'];

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-name-pair-form-key-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/**
 * Run the CLI with --json; the envelope it prints.
 * @param {string[]} args
 * @returns {Promise<any>}
 */
const cli = async args =>
  JSON.parse((await runCli([...args, '--json'], cwd)).stdout);

/** The suggestion names. @param {any} r */
const names = r => (r.suggestions ?? []).map((/** @type {any} */ x) => x.name);

describe('new reads pairs with quoted or swapped keys', () => {
  for (const [args, want] of [
    [['t2', '"like": "neutral"'], [/--like neutral\b/]],
    [['t2', "'like': 'neutral'"], [/--like neutral\b/]],
    [['t2', '"like"="neutral"'], [/--like neutral\b/]],
    [
      ['t2', '--like', 'neutral', '"accent": "red"'],
      [/--like neutral\b/, /--accent red\b/],
    ],
    [
      ['t2', '--like', 'neutral', 'red=accent'],
      [/--like neutral\b/, /--accent red\b/],
    ],
    [['t2', '--like', 'neutral', 'red: accent'], [/--accent red\b/]],
    [
      ['t2', '--like', 'neutral', 'red=accent', 'pill=corners'],
      [/--accent red\b/, /--corners pill\b/],
    ],
    [['t2', 'stone=like'], [/--like stone\b/]],
    [['t2', 'neutral=like'], [/--like neutral\b/]],
    [['t2', 'neutral: like'], [/--like neutral\b/]],
  ])
    it(
      `new ${args.join(' ')}`,
      async () => {
        const r = await cli([...ED, 'new', ...args]);
        expect(r.error).toBeDefined();
        // (A base not installed here leads with its install.)
        const line = names(r).find((/** @type {string} */ n) =>
          / new /.test(n),
        );
        expect(line).toMatch(/ new t2 /);
        for (const w of want) expect(line).toMatch(w);
        expect(line).not.toMatch(/--neutral lime|t2-/);
      },
      T,
    );
});

describe('the name typed as an option', () => {
  for (const flag of ['--theme', '--name'])
    it(
      `new ${flag} t2 --like neutral says ${flag} is no option, never that "" is extra`,
      async () => {
        const r = await cli([...ED, 'new', flag, 't2', '--like', 'neutral']);
        expect(r.error).toBeDefined();
        expect(r.error).not.toMatch(/"" is extra/);
        expect(r.error).toContain(`${flag} is no option of new`);
        expect(names(r)[0]).toMatch(/ new t2 --like neutral$/);
      },
      T,
    );

  it(
    'new --theme=t2 --like neutral offers new t2, never my-theme',
    async () => {
      const r = await cli([...ED, 'new', '--theme=t2', '--like', 'neutral']);
      expect(r.error).toBeDefined();
      expect(names(r)[0]).toMatch(/ new t2 --like neutral$/);
    },
    T,
  );
});

describe('a built-in theme typed with another word', () => {
  for (const args of [
    ['t2', 'theme', 'neutral'],
    ['t2', 'neutral', 'stone'],
    ['t2', 'theme:', 'neutral'],
  ])
    it(
      `new ${args.join(' ')} offers the base, never a --neutral value`,
      async () => {
        const r = await cli([...ED, 'new', ...args]);
        expect(r.error).toBeDefined();
        const line = names(r).find((/** @type {string} */ n) =>
          / new /.test(n),
        );
        expect(line).toMatch(/ new t2 --like neutral$/);
      },
      T,
    );
});

describe('a CSS property typed after the name', () => {
  for (const [thing, value] of [
    ['padding', '8px'],
    ['color', 'red'],
    ['gap', '4px'],
  ])
    it(
      `new t2 ${thing} ${value} offers a line that works, never a set without --on`,
      async () => {
        const r = await cli([...ED, 'new', 't2', thing, value]);
        expect(r.error).toBeDefined();
        expect(names(r)[0]).toMatch(/ new t2$/);
        expect(
          names(r).some((/** @type {string} */ n) =>
            new RegExp(` set t2 ${thing} `).test(n),
          ),
        ).toBe(false);
        const next = names(r)[1];
        expect(next).toMatch(new RegExp(` how '${value} ${thing}'$`));
        const followed = await cli([
          .../** @type {string[]} */ (
            next.slice(next.indexOf('experimental ')).split(' ')
          ).slice(0, 4),
          `${value} ${thing}`,
        ]);
        expect(followed.error).toBeUndefined();
      },
      T,
    );

  for (const word of [
    '\'"base": "neutral"\'',
    "'padding: 8px'",
    '\'{"padding":"8px"}\'',
  ])
    it(
      `new t2 ${word} never glues it into the name`,
      async () => {
        const typed = word.slice(1, -1);
        const r = await cli([...ED, 'new', 't2', typed]);
        expect(r.error).toBeDefined();
        expect(names(r)[0]).toMatch(/ new t2( --like neutral)?$/);
        expect(names(r)[0]).not.toMatch(/t2-/);
      },
      T,
    );
});

describe('a base or setting typed with its own quotes', () => {
  for (const [word, want] of [
    ["'base neutral'", /--like neutral\b/],
    ['"accent red"', /--accent red\b/],
  ])
    it(
      `new t2 ${word} reads it, never a name of its words`,
      async () => {
        const r = await cli([...ED, 'new', 't2', word]);
        expect(r.error).toBeDefined();
        const line = names(r).find((/** @type {string} */ n) =>
          / new /.test(n),
        );
        expect(line).toMatch(/ new t2 /);
        expect(line).toMatch(want);
        expect(line).not.toMatch(/t2-/);
      },
      T,
    );

  it(
    'new t2 "accent" red reads the quoted dial',
    async () => {
      const r = await cli([...ED, 'new', 't2', '"accent"', 'red']);
      expect(r.error).toBeDefined();
      expect(names(r)[0]).toMatch(/ new t2 --accent red$/);
    },
    T,
  );
});

describe('show with the theme typed as an option', () => {
  it(
    'show --theme t offers show t, and it runs',
    async () => {
      const r = await cli([...ED, 'show', '--theme', 't']);
      expect(r.error).toBeDefined();
      expect(r.error).toContain("the theme is show's first word");
      expect(names(r)[0]).toMatch(/ show t$/);
      const followed = await cli([...ED, 'show', 't']);
      expect(followed.error).toBeUndefined();
    },
    T,
  );
});
