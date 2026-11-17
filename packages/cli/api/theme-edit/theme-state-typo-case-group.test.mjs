// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A --when or --state typo, or another case, on a group is read as it
 * is on one part, against what the group's members have between them: the
 * refusal leads with the corrected line, other flags kept, and it runs. A
 * setting's name typed where the theme goes gets a command on the theme
 * here, never a theme of the setting's name; a bare list of setting names
 * is the list.
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

// The renders are stood in for: these tests are about settings, files and
// messages, not the rendered pages.
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

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-state-typo-case-group-',
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
 * @returns {any}
 */
const cli = async args => {
  const r = await runCli([...args, '--json'], cwd);
  return JSON.parse(r.stdout);
};

/**
 * Run a suggested editor command as printed (from `experimental` on).
 * @param {string} line
 */
const follow = async line => {
  const args = splitCommand(line.slice(line.indexOf('experimental ')));
  if (!args) throw new Error(`cannot read ${line}`);
  return await cli(args);
};

const file = () => path.join(cwd, 'themes/t/t.settings.json');

const data = () => JSON.parse(fs.readFileSync(file(), 'utf8'));
/** The suggestion names. @param {any} r */
const names = r => (r.suggestions ?? []).map((/** @type {any} */ x) => x.name);

/** Run the CLI as text; what it prints. @param {string[]} args */
const text = async args => (await runCli(args, cwd)).stdout;

/** @param {(d: any) => void} fn */
const edit = fn => {
  const d = data();
  fn(d);
  fs.writeFileSync(file(), JSON.stringify(d, null, 2));
};
describe('a typo on a group scope', () => {
  for (const [args, fixed] of [
    [
      [
        'border-color',
        'red',
        '--on',
        'inputs',
        '--when',
        'status:eror',
        '--mode',
        'dark',
      ],
      '--on inputs --when status:error --mode dark',
    ],
    [
      ['border-color', 'red', '--on', 'inputs', '--when', 'Status:Error'],
      '--on inputs --when status:error',
    ],
    [
      ['box-shadow', 'none', '--on', 'inputs', '--state', 'focus-whitin'],
      '--on inputs --state focus-within',
    ],
    [
      ['box-shadow', 'none', '--on', 'inputs', '--state', 'hovr'],
      '--on inputs --state hover',
    ],
    [
      ['border-color', 'red', '--on', 'checks', '--state', 'chekced'],
      '--on checks --state checked',
    ],
  ])
    it(
      `${args.join(' ')} leads with the corrected line, and it runs`,
      async () => {
        const r = await cli([...ED, 'set', 't', ...args]);
        expect(r.error).toBeDefined();
        const line = names(r)[0];
        expect(line).toContain(`set t ${args[0]} ${args[1]} ${fixed}`);
        const after = await follow(line);
        expect(after.error, line).toBeUndefined();
      },
      T,
    );
});

describe('a setting typed where the theme goes', () => {
  it(
    'undo of a setting no theme holds offers a look at the theme here',
    async () => {
      const r = await cli([...ED, 'undo', 'corners']);
      expect(names(r)[0]).toContain('show t');
      expect(r.suggestions[0].reason).toContain('no theme here holds corners');
      expect((await follow(names(r)[0])).error).toBeUndefined();
    },
    T,
  );

  it(
    'show of a setting offers show of the theme here, never new',
    async () => {
      const r = await cli([...ED, 'show', 'accent']);
      expect(names(r)).not.toContain(expect.stringContaining('new accent'));
      expect(names(r)[0]).toContain('show t');
    },
    T,
  );

  it(
    'set with the theme left out offers the same words on the theme here, and it runs',
    async () => {
      const r = await cli([...ED, 'set', 'corners', 'pill']);
      const line = names(r)[0];
      expect(line).toContain('set t corners pill');
      expect((await follow(line)).error).toBeUndefined();
    },
    T,
  );
});

describe('a bare list of setting names', () => {
  it(
    'is read as the list: one undo line each, and each runs',
    async () => {
      for (const [k, v] of [
        ['accent', 'red'],
        ['corners', 'pill'],
        ['spacing', 'roomy'],
      ])
        await cli([...ED, 'set', 't', k, v]);
      const r = await cli([...ED, 'undo', 't', 'accent', 'corners', 'spacing']);
      const lines = names(r).filter((/** @type {string} */ x) =>
        x.includes(' undo t '),
      );
      expect(
        lines.map((/** @type {string} */ x) => x.split(' undo ')[1]),
      ).toEqual(['t accent', 't corners', 't spacing']);
      for (const line of lines)
        expect((await follow(line)).error).toBeUndefined();
    },
    T,
  );
});

describe('an unknown subcommand followed by an option', () => {
  it(
    'is named as the unknown subcommand, with the near ones',
    async () => {
      const r = await cli([
        'experimental',
        'theme',
        'preview',
        'path',
        '--theme',
        't',
      ]);
      expect(r.code).toBe('ERR_UNKNOWN_SUBCOMMAND');
      expect(r.error).toContain(
        "unknown subcommand 'experimental theme preview path'",
      );
      expect(names(r).join(' ')).toContain('app');
    },
    T,
  );

  it(
    'in a stable group keeps its unknown-option error',
    async () => {
      const r = await cli(['theme', 'bogus', '--foo']);
      expect(r.code).toBe('ERR_INVALID_OPTION');
    },
    T,
  );
});

describe('a list value with one item misspelled', () => {
  for (const typed of [
    'blod tight',
    'blod, tight',
    'bold, tihgt',
    'blod and tight',
  ])
    it(
      `headings ${typed} gets one line per word, and each runs`,
      async () => {
        const r = await cli([...ED, 'set', 't', 'headings', typed]);
        const lines = names(r).slice(0, 2);
        expect(lines).toEqual([
          expect.stringContaining('set t headings bold'),
          expect.stringContaining('set t headings tight'),
        ]);
        for (const line of lines)
          expect((await follow(line)).error).toBeUndefined();
      },
      T,
    );
});

describe('three bare words after undo', () => {
  it(
    'are a setting and its value when not every word names a setting',
    async () => {
      await cli([...ED, 'set', 't', 'font', 'Inter Tight']);
      const r = await cli([...ED, 'undo', 't', 'font', 'Inter', 'Tight']);
      expect(String(r.error)).not.toContain('names 3 settings');
      expect(String(r.error)).not.toContain('is not a dial');
    },
    T,
  );
});
