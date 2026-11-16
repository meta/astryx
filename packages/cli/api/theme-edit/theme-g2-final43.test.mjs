// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file More of what a person types read as they meant it: new's base and
 * settings in the key forms, swapped, quoted or after an option's value;
 * settings typed where the name goes; two bases in one --like; `like` for
 * the base; a theme typed as an option; a theme with a setting pasted on;
 * a value list where the theme goes; a whole command pasted as one word;
 * and an undo by value that reads the scope typed.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {themeEditNew} from './theme-edit.mjs';
import {splitCommand} from './_vet.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

// The renders are stood in for: these tests are about settings and lines.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

const T = 240_000;
const ED = ['experimental', 'theme', 'editor'];

/** @type {string} */
let cwd;
/** @type {string} */
let fresh;

const file = () => path.join(cwd, 'themes/t/t.settings.json');
const settings = () => JSON.parse(fs.readFileSync(file(), 'utf8')).settings;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-g2-final43-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
  fresh = fs.readFileSync(file(), 'utf8');
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

beforeEach(() => {
  fs.writeFileSync(file(), fresh);
  fs.rmSync(path.join(cwd, 'themes/t/t.history.json'), {force: true});
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

/**
 * Run a suggested command as printed (from `experimental` on).
 * @param {string} line
 */
const follow = async line => {
  const args = splitCommand(line.slice(line.indexOf('experimental ')));
  if (!args) throw new Error(`cannot read ${line}`);
  return await cli(args);
};

/** @param {string[][]} sets */
const setAll = async sets => {
  for (const s of sets)
    expect((await cli([...ED, 'set', 't', ...s])).error).toBeUndefined();
};

/** @param {any} r */
const noNew = r =>
  expect(names(r).some((/** @type {string} */ n) => / new /.test(n))).toBe(
    false,
  );

describe('new reads its base and settings as typed', () => {
  for (const [args, want, not] of [
    [['t2', 'like=neutral'], [/--like neutral\b/], /t2-like/],
    [['t2', 'like:', 'neutral'], [/--like neutral\b/], /t2-like/],
    [['t2', 'like: neutral'], [/--like neutral\b/], /t2-like/],
    [['t2', 'red', 'accent'], [/--accent red\b/], /t2-red/],
    [['t2', 'accent red'], [/--accent red\b/], /t2-accent/],
    [
      ['t2', 'accent red, corners pill'],
      [/--accent red\b/, /--corners pill\b/],
      /t2-accent/,
    ],
    [['t2', '--accent', 'red', 'corners'], [/--accent red\b/], /t2-corners/],
    [['t2', '--accent', 'red', 'foo'], [/--accent red\b/], /'red foo'/],
  ])
    it(
      `new ${args.join(' ')}`,
      async () => {
        const r = await cli([...ED, 'new', ...args]);
        expect(r.error).toBeDefined();
        const line = names(r)[0];
        expect(line).toMatch(/ new t2\b/);
        for (const w of want) expect(line).toMatch(w);
        expect(line).not.toMatch(not);
      },
      T,
    );

  it(
    'new t2 --corners pill padding 8px keeps --corners and sets padding after',
    async () => {
      const r = await cli([
        ...ED,
        'new',
        't2',
        '--corners',
        'pill',
        'padding',
        '8px',
      ]);
      expect(names(r)[0]).toMatch(/ new t2 .*--corners pill$/);
      expect(names(r)[1]).toMatch(/ set t2 padding 8px$/);
    },
    T,
  );

  it(
    "new 'accent: red' --like neutral keeps the setting on a free name",
    async () => {
      const r = await cli([...ED, 'new', 'accent: red', '--like', 'neutral']);
      expect(r.error).toBeDefined();
      expect(names(r)[0]).toMatch(/ new my-theme\b/);
      expect(names(r)[0]).toMatch(/--accent red\b/);
      expect(names(r)[0]).toMatch(/--like neutral\b/);
    },
    T,
  );

  for (const value of ['neutral,stone', 'neutral stone'])
    it(
      `new t2 --like '${value}' offers the first built-in base`,
      async () => {
        const r = await cli([...ED, 'new', 't2', '--like', value]);
        expect(r.error).toBeDefined();
        expect(names(r)[0]).toMatch(/ new t2 --like neutral\b/);
      },
      T,
    );
});

describe('like is the base', () => {
  it(
    'set t like none offers set t base none, and it runs',
    async () => {
      const r = await cli([...ED, 'set', 't', 'like', 'none']);
      expect(r.error).toBeDefined();
      expect(names(r)[0]).toMatch(/ set t base none$/);
      expect((await follow(names(r)[0])).error).toBeUndefined();
    },
    T,
  );

  it(
    'undo t like offers undo t base',
    async () => {
      const r = await cli([...ED, 'undo', 't', 'like']);
      expect(r.error).toBeDefined();
      expect(names(r)[0]).toMatch(/ undo t base$/);
    },
    T,
  );
});

describe('the theme typed in other places', () => {
  it(
    'set --theme t accent red offers set t accent red, and it runs',
    async () => {
      const r = await cli([...ED, 'set', '--theme', 't', 'accent', 'red']);
      expect(r.error).toBeDefined();
      expect(names(r)[0]).toMatch(/ set t accent red$/);
      expect((await follow(names(r)[0])).error).toBeUndefined();
      expect(settings()).toEqual([
        expect.objectContaining({thing: 'accent', value: 'red'}),
      ]);
    },
    T,
  );

  for (const word of ['t=accent', 't: accent'])
    it(
      `show '${word}' offers show t, never new`,
      async () => {
        const r = await cli([...ED, 'show', word]);
        expect(r.error).toBeDefined();
        noNew(r);
        expect(names(r)[0]).toMatch(/ show t$/);
      },
      T,
    );

  it(
    "show 'Inter, Arial' (a value list) offers show t, never new, never more than one theme",
    async () => {
      const r = await cli([...ED, 'show', 'Inter, Arial']);
      expect(r.error).toBeDefined();
      expect(r.error).not.toMatch(/more than one theme/);
      noNew(r);
      expect(names(r)[0]).toMatch(/ show t$/);
    },
    T,
  );

  it(
    "set 'set t accent red' (a command pasted as one word) offers set t accent red, and it runs",
    async () => {
      const r = await cli([...ED, 'set', 'set t accent red']);
      expect(r.error).toBeDefined();
      expect(names(r)[0]).toMatch(/ editor set t accent red$/);
      expect((await follow(names(r)[0])).error).toBeUndefined();
    },
    T,
  );
});

describe('undo by a held value reads the scope typed', () => {
  for (const on of ['card', 'Card', 'cards'])
    it(
      `undo t 8px --on ${on} leads with the card setting, and it removes that one`,
      async () => {
        await setAll([
          ['padding', '8px', '--on', 'button'],
          ['padding', '8px', '--on', 'card'],
        ]);
        const r = await cli([...ED, 'undo', 't', '8px', '--on', on]);
        expect(r.error).toBeDefined();
        expect(names(r)[0]).toMatch(/ undo t padding 8px --on card$/);
        expect((await follow(names(r)[0])).error).toBeUndefined();
        expect(settings()).toEqual([expect.objectContaining({on: 'button'})]);
      },
      T,
    );
});
