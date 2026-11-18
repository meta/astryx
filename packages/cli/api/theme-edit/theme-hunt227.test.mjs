// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A line offered when the theme is left out keeps the options typed,
 * so following it changes what was asked, never the whole theme. A
 * settings file every command reads (`"Settings"`) is a theme that exists
 * to `new`. undo reads the words after the thing as one value, as set does.
 * With the theme left out, undo reads the scope in the spellings it takes
 * with the theme typed, and a token typed where the theme goes is never a
 * theme to make.
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
  cwd = makeLinkedFixture('astryx-theme-hunt227-', FIXTURE_PACKAGES);
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
describe('a line for the theme left out keeps the options typed', () => {
  for (const [args, kept] of [
    [['set', 'background-color', 'red', '--on', 'card'], '--on card'],
    [
      ['set', 'background-color', 'red', '--on', 'card', '--state', 'hover'],
      '--on card --state hover',
    ],
    [
      ['set', 'color', 'blue', '--on', 'button', '--mode', 'dark'],
      '--on button --mode dark',
    ],
    [
      ['set', 'border-color', 'red', '--on', 'text-input', '--only'],
      '--on text-input --only',
    ],
  ])
    it(
      `${args.join(' ')}: the line on t keeps ${kept}, and it changes only that`,
      async () => {
        const r = await cli([...ED, ...args]);
        expect(r.error).toBeDefined();
        const line = names(r)[0];
        expect(line).toContain(
          `${args
            .slice(0, 3)
            .join(' ')
            .replace(/^(\w+) /, '$1 t ')} `,
        );
        expect(line).toContain(kept);
        const followed = await follow(line);
        expect(followed.error).toBeUndefined();
        const saved = data().settings;
        expect(saved).toHaveLength(1);
        expect(saved[0]).toMatchObject({thing: args[1], on: args[4]});
      },
      T,
    );

  it(
    'new --like neutral: the free name keeps --like, and the theme is made on neutral',
    async () => {
      const r = await cli([...ED, 'new', '--like', 'neutral']);
      const line = names(r)[0];
      expect(line).toMatch(/ new \S+ --like neutral$/);
      const followed = await follow(line);
      expect(followed.error).toBeUndefined();
      const made = line.split(' new ')[1].split(' ')[0];
      const settings = JSON.parse(
        fs.readFileSync(
          path.join(cwd, `themes/${made}/${made}.settings.json`),
          'utf8',
        ),
      );
      expect(settings.like).toBe('neutral');
      fs.rmSync(path.join(cwd, `themes/${made}`), {recursive: true});
    },
    T,
  );

  it(
    'undo --on card --mode dark: the line keeps the scope, and its own line removes that setting',
    async () => {
      edit(d => {
        d.settings = [
          {thing: 'accent', value: 'red', source: 'dial'},
          {
            thing: 'background-color',
            value: 'red',
            source: 'property',
            on: 'card',
            mode: 'dark',
          },
        ];
      });
      const r = await cli([...ED, 'undo', '--on', 'card', '--mode', 'dark']);
      const line = names(r)[0];
      expect(line).toContain('undo t --on card --mode dark');
      const next = await follow(line);
      expect(next.error).toBeDefined();
      const removed = await follow(names(next)[0]);
      expect(removed.error).toBeUndefined();
      expect(data().settings).toEqual([
        {thing: 'accent', value: 'red', source: 'dial'},
      ]);
    },
    T,
  );

  it(
    'show --section actions: the line keeps the section, and it runs',
    async () => {
      const r = await cli([...ED, 'show', '--section', 'actions']);
      const line = names(r)[0];
      expect(line).toContain('show t --section actions');
      expect((await follow(line)).error).toBeUndefined();
    },
    T,
  );
});

describe('a settings file whose list is written "Settings"', () => {
  it(
    'is a theme that exists to new, never made again',
    async () => {
      edit(d => {
        d.Settings = [
          {thing: 'corners', value: 'pill', source: 'dial'},
          {thing: 'accent', value: 'red', source: 'dial'},
        ];
        delete d.settings;
      });
      const before = fs.readFileSync(file(), 'utf8');
      const r = await cli([...ED, 'new', 't', '--like', 'neutral']);
      expect(r.error).toMatch(/already exists/);
      expect(fs.readFileSync(file(), 'utf8')).toBe(before);
      expect(
        fs.existsSync(path.join(cwd, 'themes/t/t.settings.damaged.json')),
      ).toBe(false);
      // Each line it offers runs.
      for (const line of names(r).filter(
        (/** @type {string} */ n) => !n.includes(' new '),
      ))
        expect((await follow(line)).error).toBeUndefined();
    },
    T,
  );
});

describe('a settings file with both "settings" and "Settings"', () => {
  it(
    'reads them as one list, says so, and the next save keeps every setting',
    async () => {
      edit(d => {
        d.settings = [{thing: 'accent', value: 'red', source: 'dial'}];
        d.Settings = [
          {thing: 'corners', value: 'pill', source: 'dial'},
          {thing: 'accent', value: 'blue', source: 'dial'},
        ];
      });
      expect((await cli([...ED, 'show', 't'])).error).toBeUndefined();
      const set = await cli([...ED, 'set', 't', 'spacing', 'roomy']);
      expect(set.error).toBeUndefined();
      expect(JSON.stringify(set)).toMatch(
        /writes both \\"settings\\" and \\"Settings\\"; read as one list, \\"settings\\" winning/,
      );
      const d = data();
      expect(d.Settings).toBeUndefined();
      expect(d.settings).toEqual([
        {thing: 'accent', value: 'red', source: 'dial'},
        {thing: 'corners', value: 'pill', source: 'dial'},
        {thing: 'spacing', value: 'roomy', source: 'dial'},
      ]);
    },
    T,
  );
});

describe('undo reads the words after the thing as one value', () => {
  for (const [args, kept] of [
    [['font', 'Inter', 'Tight'], 'padding'],
    [['padding', '4px', '8px', '--on', 'card'], 'font'],
    [['--color-accent', 'rgb(1,', '2,', '3)'], 'font'],
  ])
    it(
      `undo t ${args.join(' ')} removes that setting`,
      async () => {
        edit(d => {
          d.settings = [
            {thing: 'font', value: 'Inter Tight', source: 'dial'},
            {
              thing: 'padding',
              value: '4px 8px',
              source: 'property',
              on: 'card',
            },
            {thing: '--color-accent', value: 'rgb(1, 2, 3)', source: 'token'},
          ];
        });
        const r = await cli([...ED, 'undo', 't', ...args]);
        expect(r.error).toBeUndefined();
        const things = data().settings.map((/** @type {any} */ s) => s.thing);
        expect(things).not.toContain(args[0]);
        expect(things).toContain(kept);
      },
      T,
    );

  it(
    'a value that is not the saved one is refused with the line that removes it',
    async () => {
      edit(d => {
        d.settings = [
          {thing: 'padding', value: '4px 8px', source: 'property', on: 'card'},
        ];
      });
      const r = await cli([
        ...ED,
        'undo',
        't',
        'padding',
        '2px',
        '9px',
        '--on',
        'card',
      ]);
      expect(r.error).toBeDefined();
      expect(r.error).not.toMatch(/does not take/);
      const removed = await follow(names(r)[0]);
      expect(removed.error).toBeUndefined();
      expect(data().settings).toEqual([]);
    },
    T,
  );
});

describe('undo with the theme left out reads the scope as undo does', () => {
  for (const scope of [
    ['--on', 'button', '--state', 'focusVisible'],
    ['--on', 'button', '--state', 'focus visible'],
    ['--on', 'Card', '--mode', 'dark'],
    ['--on', 'card', '--mode', 'Dark'],
  ])
    it(
      `undo background-color ${scope.join(' ')} offers the undo on t, and it removes that setting`,
      async () => {
        const saved = [
          {
            thing: 'background-color',
            value: 'red',
            source: 'property',
            on: 'card',
            mode: 'dark',
          },
          {
            thing: 'background-color',
            value: 'blue',
            source: 'property',
            on: 'button',
            state: 'focus-visible',
          },
        ];
        edit(d => {
          d.settings = saved;
        });
        const r = await cli([...ED, 'undo', 'background-color', ...scope]);
        expect(r.error).toBeDefined();
        expect(
          (r.suggestions ?? [])
            .map((/** @type {any} */ x) => x.reason)
            .join(' '),
        ).not.toMatch(/no theme here holds/);
        const line = names(r)[0];
        expect(line).toContain('undo t background-color');
        expect((await follow(line)).error).toBeUndefined();
        const gone = scope[1].toLowerCase() === 'button' ? 'button' : 'card';
        expect(data().settings.map((/** @type {any} */ s) => s.on)).toEqual([
          gone === 'button' ? 'card' : 'button',
        ]);
      },
      T,
    );
});

describe('a token typed where the theme goes', () => {
  it(
    'show --color-accent offers show t, never a theme named after the token',
    async () => {
      const r = await cli([...ED, 'show', '--color-accent']);
      expect(names(r).some((/** @type {string} */ n) => / new /.test(n))).toBe(
        false,
      );
      expect(names(r)[0]).toMatch(/ show t$/);
      expect((await follow(names(r)[0])).error).toBeUndefined();
    },
    T,
  );

  it(
    'undo --color-accent offers the undo on t when t holds it, and it runs',
    async () => {
      edit(d => {
        d.settings = [{thing: '--color-accent', value: 'red', source: 'token'}];
      });
      const r = await cli([...ED, 'undo', '--color-accent']);
      const line = names(r)[0];
      expect(line).toMatch(/ undo t --color-accent$/);
      expect((await follow(line)).error).toBeUndefined();
      expect(data().settings).toEqual([]);
    },
    T,
  );

  it(
    'undo --color-accent with no theme holding it says so and offers show t',
    async () => {
      const r = await cli([...ED, 'undo', '--color-accent']);
      expect(names(r).some((/** @type {string} */ n) => / new /.test(n))).toBe(
        false,
      );
      expect(names(r)[0]).toMatch(/ show t$/);
      expect(r.suggestions[0].reason).toMatch(
        /no theme here holds --color-accent/,
      );
    },
    T,
  );
});
