// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Settings typed where they do not go are read as settings: in the
 * theme's place (a list, a pasted form), after new's name (a colon word, a
 * typo, a base word, a property, a value across words, after an option's
 * value), and in an undo with the theme left out or the value first. An
 * undo's scope typed in a spelling set reads leads with that scope's
 * setting. An option whose value names another subcommand keeps it.
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
const themesHere = () =>
  fs.readdirSync(path.join(cwd, 'themes')).filter(d => !d.startsWith('.'));

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-place-name-undo-left-',
    FIXTURE_PACKAGES,
  );
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

/** @param {string[]} lines */
const noNew = lines => expect(lines.some(n => / new /.test(n))).toBe(false);

describe('settings typed where the theme goes', () => {
  for (const word of [
    'corners,accent',
    'corners, accent',
    'corners:pill',
    'corners=pill',
    'accent: red',
    '{"corners":"pill"}',
    '--color-accent,--radius-element',
  ])
    it(
      `show ${word} offers show t, never new, and never says it names themes`,
      async () => {
        const r = await cli([...ED, 'show', word]);
        expect(r.error).toBeDefined();
        expect(r.error).not.toMatch(/more than one theme/);
        noNew(names(r));
        expect(names(r)[0]).toMatch(/ show t$/);
      },
      T,
    );
});

describe("new's settings after the name", () => {
  for (const [args, line] of [
    [['t2', 'accent:', 'red'], / new t2 .*--accent red\b/],
    [['t2', 'Corners:', 'pill'], / new t2 .*--corners pill\b/],
    [['t2', 'base', 'neutral'], / new t2 .*--like neutral\b/],
    [['t2', 'cornres', 'pill'], / new t2 .*--corners pill\b/],
    [
      ['t2', '--like', 'neutral', 'font=Inter,', 'Arial'],
      / new t2 .*--font 'Inter, Arial'/,
    ],
    [
      ['t2', '--like', 'neutral', '--accent', 'red', 'corners', 'pill'],
      / new t2 .*--accent red .*--corners pill|--corners pill .*--accent red/,
    ],
  ])
    it(
      `new ${args.join(' ')}: each setting is its option, never part of the name`,
      async () => {
        const r = await cli([...ED, 'new', ...args]);
        expect(r.error).toBeDefined();
        expect(names(r)[0]).toMatch(line);
        expect(names(r)[0]).toMatch(/ new t2 /);
      },
      T,
    );

  it(
    'new t2 padding 8px makes t2 and points at the parts padding takes',
    async () => {
      const r = await cli([...ED, 'new', 't2', 'padding', '8px']);
      expect(r.error).toBeDefined();
      expect(names(r)[0]).toMatch(/ new t2$/);
      // A CSS property is written on a part: the ask that names them.
      expect(names(r)[1]).toMatch(/ how '8px padding'$/);
    },
    T,
  );

  it(
    "new 'corners pill' offers a free name, never corners-pill",
    async () => {
      const r = await cli([...ED, 'new', 'corners pill']);
      expect(
        names(r).some((/** @type {string} */ n) => /corners-pill/.test(n)),
      ).toBe(false);
    },
    T,
  );
});

describe('undo read as typed', () => {
  it(
    'undo with the theme left out and a comma value unquoted: the held value line, and it runs',
    async () => {
      await setAll([
        ['font', 'Inter, Arial'],
        ['corners', 'pill'],
      ]);
      const before = themesHere();
      const r = await cli([...ED, 'undo', 'Inter,', 'Arial']);
      expect(r.error).toBeDefined();
      expect(names(r)[0]).toMatch(/ undo t font 'Inter, Arial'$/);
      expect((await follow(names(r)[0])).error).toBeUndefined();
      expect(settings().map((/** @type {any} */ s) => s.thing)).toEqual([
        'corners',
      ]);
      expect(themesHere()).toEqual(before);
    },
    T,
  );

  it(
    'undo t red accent reads the two swapped, and the line removes accent only',
    async () => {
      await setAll([
        ['accent', 'red'],
        ['corners', 'pill'],
      ]);
      const r = await cli([...ED, 'undo', 't', 'red', 'accent']);
      expect(r.error).toBeDefined();
      expect(names(r)[0]).toMatch(/ undo t accent red$/);
      expect((await follow(names(r)[0])).error).toBeUndefined();
      expect(settings().map((/** @type {any} */ s) => s.thing)).toEqual([
        'corners',
      ]);
    },
    T,
  );

  for (const [flags, lead] of [
    [['--on', 'Card'], / undo t padding --on card$/],
    [['--on', 'cards'], / undo t padding --on card$/],
  ])
    it(
      `undo t padding ${flags.join(' ')} leads with the card setting`,
      async () => {
        await setAll([
          ['padding', '8px', '--on', 'button'],
          ['padding', '4px', '--on', 'card'],
        ]);
        const r = await cli([...ED, 'undo', 't', 'padding', ...flags]);
        if (r.error === undefined) {
          // Read and removed outright: the card setting is the one gone.
          expect(settings()).toEqual([expect.objectContaining({on: 'button'})]);
          return;
        }
        expect(names(r)[0]).toMatch(lead);
        expect((await follow(names(r)[0])).error).toBeUndefined();
        expect(settings()).toEqual([expect.objectContaining({on: 'button'})]);
      },
      T,
    );

  it(
    'undo t --color-accent --mode drak leads with the dark setting, and keeps the light one',
    async () => {
      await setAll([
        ['--color-accent', 'red', '--mode', 'light'],
        ['--color-accent', 'blue', '--mode', 'dark'],
      ]);
      const r2 = await cli([
        ...ED,
        'undo',
        't',
        '--color-accent',
        '--mode',
        'drak',
      ]);
      expect(r2.error).toBeDefined();
      expect(names(r2)[0]).toMatch(/ --mode dark$/);
      expect((await follow(names(r2)[0])).error).toBeUndefined();
      expect(settings()).toEqual([
        expect.objectContaining({value: 'red', mode: 'light'}),
      ]);
    },
    T,
  );
});

describe('an option whose value names another subcommand', () => {
  it(
    "editor --on show set t padding 8px keeps show as --on's value",
    async () => {
      const r = await cli([
        'experimental',
        'theme',
        'editor',
        '--on',
        'show',
        'set',
        't',
        'padding',
        '8px',
      ]);
      expect(names(r)[0]).toMatch(
        / experimental theme editor set t padding 8px --on show$/,
      );
    },
    T,
  );
});

describe('leftovers', () => {
  it(
    'experimental theme compile with no file names its usage and help',
    async () => {
      const args = ['experimental', 'theme', 'compile'];
      const r = await cli(args);
      expect(r.code).toBe('ERR_MISSING_ARGUMENT');
      expect(names(r)).toEqual([
        expect.stringMatching(/ experimental theme compile .*<files/),
        expect.stringMatching(/ experimental theme compile --help$/),
      ]);
    },
    T,
  );

  it(
    'theme build (stable) with no file keeps its released output: no lines added',
    async () => {
      const r = await cli(['theme', 'build']);
      expect(r.code).toBe('ERR_MISSING_ARGUMENT');
      expect(r.error).toBe("missing required argument 'files'");
      expect(r.suggestions).toBeUndefined();
      const text = await runCli(['theme', 'build'], cwd);
      const out = `${text.stdout}\n${text.stderr ?? ''}`;
      expect(out).toContain("missing required argument 'files'");
      expect(out).not.toMatch(/^\s*(Usage|Run):/m);
      expect(out).not.toMatch(/theme build --help/);
    },
    T,
  );

  it(
    'set t accent red --mode kdar offers the --mode dark line, never one with no mode',
    async () => {
      const r = await cli([
        ...ED,
        'set',
        't',
        'accent',
        'red',
        '--mode',
        'kdar',
      ]);
      expect(r.error).toBeDefined();
      expect(names(r)[0]).toMatch(/ --mode dark\b/);
      expect(
        names(r).some(
          (/** @type {string} */ n) => !/ --mode /.test(n) && / set t /.test(n),
        ),
      ).toBe(false);
    },
    T,
  );
});
