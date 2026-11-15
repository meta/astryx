// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Names, undo and the command line, read as typed. A set with the
 * theme left out and a value of several words gets the set on the theme
 * here. An undo never offers to make a theme: a typo of a held setting or
 * a value the theme holds gets that setting's undo, and a step back says
 * what it takes back. An unquoted value with commas is the setting's
 * value, never a list. A token typed for a new theme's name is never the
 * name offered.
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
  cwd = makeLinkedFixture('astryx-theme-hunt242-', FIXTURE_PACKAGES);
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

/** Set each pair on t, in order, through the CLI. @param {string[][]} sets */
const setAll = async sets => {
  for (const s of sets)
    expect((await cli([...ED, 'set', 't', ...s])).error).toBeUndefined();
};

describe('set with the theme left out and a value of several words', () => {
  for (const args of [
    ['padding', '4px 8px', '--on', 'card'],
    ['padding', '4px', '8px', '--on', 'card'],
    ['font', 'Inter Tight'],
    ['--color-accent', 'rgb(1, 2, 3)', '--mode', 'dark'],
  ])
    it(
      `set ${args.join(' ')} offers the set on t, every option kept, and it runs`,
      async () => {
        const r = await cli([...ED, 'set', ...args]);
        expect(r.error).toBeDefined();
        const line = names(r)[0];
        expect(line).toContain(`set t ${args[0]} `);
        for (const flag of args.filter(
          a => a.startsWith('--') && a !== args[0],
        ))
          expect(line).toContain(flag);
        expect((await follow(line)).error).toBeUndefined();
        expect(settings().map((/** @type {any} */ s) => s.thing)).toEqual([
          args[0],
        ]);
      },
      T,
    );
});

describe('undo never offers to make a theme', () => {
  for (const [word, line] of [
    ['acent', / undo t accent$/],
    ['cornrs', / undo t corners$/],
    ['red', / undo t accent red$/],
    ['pill', / undo t corners pill$/],
  ])
    it(
      `undo ${word} offers the undo of what t holds, and it runs`,
      async () => {
        await setAll([
          ['accent', 'red'],
          ['corners', 'pill'],
        ]);
        const before = themesHere();
        const r = await cli([...ED, 'undo', word]);
        expect(r.error).toBeDefined();
        expect(
          names(r).some((/** @type {string} */ n) => / new /.test(n)),
        ).toBe(false);
        expect(names(r)[0]).toMatch(line);
        expect((await follow(names(r)[0])).error).toBeUndefined();
        expect(themesHere()).toEqual(before);
        expect(settings()).toHaveLength(1);
      },
      T,
    );

  it(
    'a word that names nothing here gets a look, never a new theme',
    async () => {
      const r = await cli([...ED, 'undo', 'wombat']);
      expect(names(r).some((/** @type {string} */ n) => / new /.test(n))).toBe(
        false,
      );
      expect(names(r)[0]).toMatch(/ show t$/);
    },
    T,
  );
});

describe('undo t <a value the theme holds>', () => {
  it(
    'names the setting that holds it, and the line removes that setting, not the last change',
    async () => {
      await setAll([
        ['accent', 'red'],
        ['corners', 'pill'],
      ]);
      const r = await cli([...ED, 'undo', 't', 'red']);
      expect(r.error).toBeDefined();
      expect(names(r)[0]).toMatch(/ undo t accent red$/);
      expect((await follow(names(r)[0])).error).toBeUndefined();
      expect(settings()).toEqual([
        expect.objectContaining({thing: 'corners', value: 'pill'}),
      ]);
    },
    T,
  );
});

describe('undo of a value with commas typed unquoted', () => {
  for (const [sets, args] of [
    [
      [['border-color', 'rgb(1, 2, 3)', '--on', 'card']],
      ['border-color', 'rgb(1,', '2,', '3)', '--on', 'card'],
    ],
    [[['font', 'Inter, Arial']], ['font', 'Inter,', 'Arial']],
  ])
    it(
      `undo t ${args.join(' ')} removes that setting`,
      async () => {
        await setAll([...sets, ['corners', 'pill']]);
        const r = await cli([...ED, 'undo', 't', ...args]);
        expect(r.error).toBeUndefined();
        expect(settings().map((/** @type {any} */ s) => s.thing)).toEqual([
          'corners',
        ]);
      },
      T,
    );

  it(
    'a list of settings with commas is still the list',
    async () => {
      await setAll([
        ['accent', 'red'],
        ['corners', 'pill'],
      ]);
      const r = await cli([...ED, 'undo', 't', 'accent,', 'corners']);
      expect(r.error).toBeDefined();
      expect(names(r)).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/ undo t accent$/),
          expect.stringMatching(/ undo t corners$/),
        ]),
      );
    },
    T,
  );
});

describe('a token typed for a new theme', () => {
  it(
    'new --color-accent offers a free name, never a theme named after the token',
    async () => {
      const env = await cli([...ED, 'new', '--color-accent']);
      expect(env.error).toBeDefined();
      expect(
        names(env).some((/** @type {string} */ n) =>
          /new color-accent/.test(n),
        ),
      ).toBe(false);
      expect(names(env)[0]).toMatch(/ new my-theme\b/);
    },
    T,
  );
});

describe('names typed with new', () => {
  for (const [args, line] of [
    [['t2', 'accent', 'red'], / new t2 .*--accent red\b/],
    [
      ['n1', '--like', 'neutral', 'corners', 'pill'],
      / new n1 .*--corners pill\b/,
    ],
    [['t3', 'corners=pill'], / new t3 .*--corners pill\b/],
    [['t4', 'corners: pill; accent: red'], / new t4 .*--corners pill\b/],
  ])
    it(
      `new ${args.join(' ')}: the setting is its option, never part of the name`,
      async () => {
        const r = await cli([...ED, 'new', ...args]);
        expect(r.error).toBeDefined();
        expect(names(r)[0]).toMatch(line);
        expect(names(r)[0]).not.toMatch(/ new \S*-(accent|corners)/);
      },
      T,
    );
});

describe('the theme left out, a setting and its value in one word', () => {
  it(
    "undo 'corners pill' offers undo t corners, never new",
    async () => {
      await setAll([['corners', 'pill']]);
      const r = await cli([...ED, 'undo', 'corners pill']);
      expect(names(r).some((/** @type {string} */ n) => / new /.test(n))).toBe(
        false,
      );
      expect(names(r)[0]).toMatch(/ undo t corners$/);
      expect((await follow(names(r)[0])).error).toBeUndefined();
    },
    T,
  );

  it(
    "show 'corners pill' offers show t, never new",
    async () => {
      const r = await cli([...ED, 'show', 'corners pill']);
      expect(names(r).some((/** @type {string} */ n) => / new /.test(n))).toBe(
        false,
      );
      expect(names(r)[0]).toMatch(/ show t$/);
    },
    T,
  );

  it(
    "set shadow '0 1px 2px red' --on card offers a set on t, never new shadow",
    async () => {
      const r = await cli([
        ...ED,
        'set',
        'shadow',
        '0 1px 2px red',
        '--on',
        'card',
      ]);
      expect(
        names(r).some((/** @type {string} */ n) => / new shadow/.test(n)),
      ).toBe(false);
    },
    T,
  );
});

describe('options typed before a subcommand, read as typed', () => {
  it(
    'an option before editor goes after the command it names: theme --mode dark editor set …',
    async () => {
      const r = await cli([
        'experimental',
        'theme',
        '--mode',
        'dark',
        'editor',
        'set',
        't',
        '--color-accent',
        'red',
      ]);
      expect(names(r)[0]).toMatch(
        / experimental theme editor set t --color-accent red --mode dark$/,
      );
      expect((await follow(names(r)[0])).error).toBeUndefined();
      expect(settings()).toEqual([
        expect.objectContaining({thing: '--color-accent', mode: 'dark'}),
      ]);
    },
    T,
  );

  it(
    "an option whose value is a subcommand's name keeps it: editor --mode undo undo t",
    async () => {
      const r = await cli([
        'experimental',
        'theme',
        'editor',
        '--on',
        'set',
        'set',
        't',
        'padding',
        '8px',
      ]);
      expect(names(r)[0]).toMatch(
        / experimental theme editor set t padding 8px --on set$/,
      );
    },
    T,
  );

  it(
    'preview --theme t with no subcommand: t is never the subcommand',
    async () => {
      const r = await cli(['experimental', 'theme', 'preview', '--theme', 't']);
      expect(r.code).not.toBe('ERR_UNKNOWN_SUBCOMMAND');
      expect(r.error).not.toMatch(/preview t'/);
      expect(r.error).toContain('--theme t is typed with no subcommand');
      expect(
        names(r).some((/** @type {string} */ n) => / preview add\b/.test(n)),
      ).toBe(true);
    },
    T,
  );

  it(
    'editor --mode light with no subcommand names the subcommands that take it',
    async () => {
      const r = await cli([
        'experimental',
        'theme',
        'editor',
        '--mode',
        'light',
      ]);
      expect(r.code).not.toBe('ERR_UNKNOWN_SUBCOMMAND');
      expect(r.error).toContain('--mode light is typed with no subcommand');
      expect(r.error).toMatch(/\bset\b/);
    },
    T,
  );
});
