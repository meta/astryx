// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Lines the editor offers run as offered: a typed value picks the
 * one mode's entry undo removes, a theme that does not exist gets no
 * "working" line, a dial or property name a letter off gets its set line,
 * a saved entry's field names in other letters are read, a design token
 * with a fallback is offered as typed, and a setting typed where the theme
 * goes gets that theme's undo. An undo of one of two settings says what
 * each mode shows now.
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
    'astryx-theme-value-picks-mode-entry-',
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
/** The first offered line of a refusal, followed; its result. @param {any} r */
const followFirst = async r => {
  expect(r.error).toBeDefined();
  const line = names(r)[0];
  expect(line).toBeDefined();
  const after = await follow(line);
  expect(after.error, line).toBeUndefined();
  return {line, after};
};

describe('a typed value picks the mode', () => {
  it(
    'undo with the value one mode holds removes that entry and keeps the other',
    async () => {
      edit(d => {
        d.settings.push(
          {
            thing: '--color-accent',
            value: 'red',
            source: 'token',
            mode: 'dark',
          },
          {
            thing: '--color-accent',
            value: 'blue',
            source: 'token',
            mode: 'light',
          },
        );
      });
      const r = await cli([...ED, 'undo', 't', '--color-accent', 'red']);
      expect(r.error).toBeUndefined();
      expect(
        data().settings.filter(
          (/** @type {any} */ x) => x.thing === '--color-accent',
        ),
      ).toEqual([
        {
          thing: '--color-accent',
          value: 'blue',
          source: 'token',
          mode: 'light',
        },
      ]);
    },
    T,
  );

  it(
    'a value neither mode holds is refused, naming both',
    async () => {
      edit(d => {
        d.settings.push(
          {
            thing: '--color-accent',
            value: 'red',
            source: 'token',
            mode: 'dark',
          },
          {
            thing: '--color-accent',
            value: 'blue',
            source: 'token',
            mode: 'light',
          },
        );
      });
      const r = await cli([...ED, 'undo', 't', '--color-accent', 'green']);
      expect(r.error).toContain('not green');
    },
    T,
  );

  it(
    'an undo of the both-modes setting says what each mode shows now',
    async () => {
      await cli([...ED, 'set', 't', 'background-color', 'red', '--on', 'card']);
      await cli([
        ...ED,
        'set',
        't',
        'background-color',
        'blue',
        '--on',
        'card',
        '--mode',
        'dark',
      ]);
      const r = await cli([
        ...ED,
        'undo',
        't',
        'background-color',
        '--on',
        'card',
      ]);
      expect(r.data.now).toBe(
        "the base theme's value in light mode and background-color = blue on card [dark only] in dark mode",
      );
    },
    T,
  );
});

describe('a theme typed second', () => {
  it(
    'gets only lines that run, never a swap on a theme that does not exist',
    async () => {
      const r = await cli([...ED, 'set', 'accent', 't', 'red']);
      expect(names(r)).not.toContain(
        expect.stringContaining('set accent red t'),
      );
      const {line} = await followFirst(r);
      expect(line).toContain('set t accent red');
    },
    T,
  );
});

describe('a dial or property name a letter off', () => {
  for (const args of [
    ['accnt', 'red'],
    ['cornres', 'pill'],
    ['paddng', '8px', '--on', 'card'],
    ['backgrund-color', 'red', '--on', 'card', '--state', 'hover'],
  ])
    it(
      `${args.join(' ')} gets the set line, value and scope kept, and it runs`,
      async () => {
        const r = await cli([...ED, 'set', 't', ...args]);
        expect(r.code).toBe('ERR_THEME_UNKNOWN_THING');
        const {line} = await followFirst(r);
        expect(line).toContain(` ${args.slice(1).join(' ')}`);
      },
      T,
    );
});

describe('saved entries', () => {
  it(
    'with field names in other letters are read, with a note, and keep the other settings',
    async () => {
      edit(d => {
        d.settings.push(
          {thing: 'accent', value: 'red', source: 'dial'},
          {Thing: 'corners', Value: 'pill'},
        );
      });
      const r = await cli([...ED, 'set', 't', 'spacing', 'roomy']);
      expect(r.error).toBeUndefined();
      const saved = data().settings.map((/** @type {any} */ x) => [
        x.thing,
        x.value,
      ]);
      expect(saved).toEqual(
        expect.arrayContaining([
          ['accent', 'red'],
          ['corners', 'pill'],
          ['spacing', 'roomy'],
        ]),
      );
    },
    T,
  );

  it(
    'a lone field is never read as a setting of that name',
    async () => {
      edit(d => {
        d.settings.push({value: 'pill'});
      });
      const r = await cli([...ED, 'show', 't']);
      expect(String(r.error ?? '')).not.toContain('value has no source');
    },
    T,
  );
});

describe('a design token with a fallback', () => {
  it(
    'is offered as typed in a token repair, and the line runs',
    async () => {
      const r = await cli([
        ...ED,
        'set',
        't',
        '--color-acent',
        'var(--color-error, red)',
      ]);
      const {line} = await followFirst(r);
      expect(line).toContain("--color-accent 'var(--color-error, red)'");
    },
    T,
  );

  it(
    'is offered as typed in a part repair, and the line runs',
    async () => {
      const r = await cli([
        ...ED,
        'set',
        't',
        'background-color',
        'var(--color-error, red)',
        '--on',
        'crad',
      ]);
      const {line} = await followFirst(r);
      expect(line).toContain("'var(--color-error, red)' --on card");
    },
    T,
  );
});

describe('a setting typed where the theme goes', () => {
  it(
    "with a scope gets that theme's undo, never a look named after the setting",
    async () => {
      await cli([...ED, 'set', 't', 'background-color', 'red', '--on', 'card']);
      const r = await cli([...ED, 'undo', 'background-color', '--on', 'card']);
      expect(names(r)).not.toContain(
        expect.stringContaining('show background-color'),
      );
      const {line} = await followFirst(r);
      expect(line).toContain('undo t background-color --on card');
    },
    T,
  );

  it(
    "alone gets that theme's undo, never a new theme named after it",
    async () => {
      await cli([...ED, 'set', 't', 'accent', 'red']);
      const r = await cli([...ED, 'undo', 'accent']);
      expect(names(r)).not.toContain(expect.stringContaining('new accent'));
      const {line} = await followFirst(r);
      expect(line).toContain('undo t accent');
    },
    T,
  );

  it(
    'that no theme holds gets no new theme of its name',
    async () => {
      const r = await cli([...ED, 'undo', 'corners']);
      expect(names(r)).not.toContain(expect.stringContaining('new corners'));
    },
    T,
  );
});
