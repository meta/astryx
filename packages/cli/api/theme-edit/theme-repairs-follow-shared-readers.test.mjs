// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Repairs follow the shared readers: a saved property name in another
 * form is replaced by the line that sets it; a unit after a space joins its
 * number for every CSS unit; a --when typo gets the corrected line, saved
 * or typed; undo with a value a one-mode entry does not hold is refused;
 * new reads a family with a weight as set does; and saved entries in forms
 * set reads typed are read so.
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
    'astryx-theme-repairs-follow-shared-readers-',
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
/** show's open problems. */
const open = async () => (await cli([...ED, 'show', 't'])).data.openProblems;

/** The line a refusal offers, after the editor prefix. @param {any} r */
const lines = r =>
  names(r).map((/** @type {string} */ n) => n.slice(n.indexOf('editor ') + 7));
/** The full name of an offered line. @param {any} r @param {string} l */
const named = (r, l) =>
  names(r).find((/** @type {string} */ n) => n.endsWith(`editor ${l}`));
/** Replace the saved settings. @param {any[]} settings */
const save = settings =>
  edit(d => {
    d.settings = settings;
  });

describe('a saved property name in another form', () => {
  for (const thing of ['background color', 'Background-Color']) {
    it(
      `"${thing}": read as background-color, and saved so by the next change`,
      async () => {
        save([{thing, value: 'red', source: 'property', on: 'card'}]);
        expect((await cli([...ED, 'show', 't'])).error).toBeUndefined();
        const r = await cli([...ED, 'set', 't', 'corners', 'pill']);
        expect(JSON.stringify(r.data.notes)).toContain(
          'read as background-color',
        );
        expect(data().settings).toEqual([
          {
            thing: 'background-color',
            value: 'red',
            source: 'property',
            on: 'card',
          },
          {thing: 'corners', value: 'pill', source: 'dial'},
        ]);
        expect((await cli([...ED, 'show', 't'])).error).toBeUndefined();
      },
      T,
    );
  }
});

describe('a unit after a space', () => {
  for (const [prop, typed, meant, on] of [
    ['width', '50 %', "'50%'", 'card'],
    ['opacity', '50 %', "'50%'", 'card'],
    ['width', '50 vw', '50vw', 'card'],
    ['transition-duration', '200 ms', '200ms', 'button'],
    ['padding', '1,5 rem', '1.5rem', 'card'],
  ]) {
    it(
      `${prop} "${typed}" is ${meant}`,
      async () => {
        const r = await cli([...ED, 'set', 't', prop, typed, '--on', on]);
        const line = `set t ${prop} ${meant} --on ${on}`;
        expect(lines(r)).toContain(line);
        expect((await follow(named(r, line))).data).toBeTruthy();
        expect(data().settings.at(-1)).toMatchObject({
          thing: prop,
          value: meant.replace(/'/g, ''),
        });
      },
      T,
    );
  }
});

describe('a --when typo', () => {
  for (const [when, meant] of [
    ['variant:primray', 'variant:primary'],
    ['siez:lg', 'size:lg'],
    ['varient:primary', 'variant:primary'],
  ]) {
    it(
      `typed ${when}: the line with --when ${meant}`,
      async () => {
        const r = await cli([
          ...ED,
          'set',
          't',
          'padding',
          '8px',
          '--on',
          'button',
          '--when',
          when,
        ]);
        const line = `set t padding 8px --on button --when ${meant}`;
        expect(lines(r)[0]).toBe(line);
        expect((await follow(named(r, line))).data).toBeTruthy();
        expect(data().settings).toEqual([
          {
            thing: 'padding',
            value: '8px',
            source: 'property',
            on: 'button',
            when: meant,
          },
        ]);
      },
      T,
    );
  }
  it(
    'saved: the undo, then the corrected line keeps the setting',
    async () => {
      save([
        {
          thing: 'padding',
          value: '8px',
          source: 'property',
          on: 'button',
          when: 'variant:primray',
        },
      ]);
      const r = await cli([...ED, 'show', 't']);
      expect(lines(r)).toEqual([
        "undo t padding --on button --when 'variant:primray'",
        'set t padding 8px --on button --when variant:primary',
      ]);
      expect(r.suggestions[1].reason).toBe(
        'then this, once the undo above has removed that setting',
      );
      for (const x of r.suggestions)
        expect((await follow(x.name)).data).toBeTruthy();
      expect(data().settings).toEqual([
        {
          thing: 'padding',
          value: '8px',
          source: 'property',
          on: 'button',
          when: 'variant:primary',
        },
      ]);
    },
    T,
  );
});

describe('undo naming a value a one-mode entry does not hold', () => {
  it(
    'is refused, naming the saved value and its mode',
    async () => {
      await cli([...ED, 'set', 't', '--color-accent', 'red', '--mode', 'dark']);
      const before = data().settings;
      const r = await cli([...ED, 'undo', 't', '--color-accent', 'blue']);
      expect(r.error).toContain(
        '--color-accent = red (whole theme, dark mode only), not blue',
      );
      expect(data().settings).toEqual(before);
      expect(lines(r)).toEqual(['undo t --color-accent --mode dark']);
      expect((await follow(r.suggestions[0].name)).data).toBeTruthy();
      expect(data().settings).toEqual([]);
    },
    T,
  );
  it(
    'on a part too; the saved value still removes it',
    async () => {
      await cli([
        ...ED,
        'set',
        't',
        'background-color',
        'red',
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
        'blue',
        '--on',
        'card',
      ]);
      expect(r.error).toContain('red on card [dark only], not blue');
      expect(lines(r)).toEqual([
        'undo t background-color --on card --mode dark',
      ]);
      expect(
        (
          await cli([
            ...ED,
            'undo',
            't',
            'background-color',
            'red',
            '--on',
            'card',
          ])
        ).data,
      ).toBeTruthy();
      expect(data().settings).toEqual([]);
    },
    T,
  );
});

describe('new with a family and a weight', () => {
  it(
    "reads --font 'Inter 600' as set does: --font Inter --headings semibold",
    async () => {
      const r = await cli([
        ...ED,
        'new',
        'n1',
        '--like',
        'neutral',
        '--font',
        'Inter 600',
      ]);
      const line = 'new n1 --like neutral --font Inter --headings semibold';
      expect(lines(r)).toEqual([line]);
      expect(r.suggestions[0].reason).toBe('do this instead');
      expect((await follow(named(r, line))).data).toBeTruthy();
      const made = JSON.parse(
        fs.readFileSync(path.join(cwd, 'themes/n1/n1.settings.json'), 'utf8'),
      ).settings;
      expect(made).toEqual(
        expect.arrayContaining([
          expect.objectContaining({thing: 'font', value: 'inter'}),
          expect.objectContaining({thing: 'headings', value: 'semibold'}),
        ]),
      );
    },
    T,
  );
});

describe('saved entries in forms set reads typed', () => {
  for (const [entry, read] of [
    [
      {setting: 'accent', value: 'red'},
      {thing: 'accent', value: 'red', source: 'dial'},
    ],
    [
      {thing: 'red', value: 'accent'},
      {thing: 'accent', value: 'red', source: 'dial'},
    ],
    [
      {thing: '--color-accent', value: 'red', source: 'token', mode: 'both'},
      {thing: '--color-accent', value: 'red', source: 'token'},
    ],
    [
      {thing: '--color-accent', value: 'red', source: 'token', mode: ''},
      {thing: '--color-accent', value: 'red', source: 'token'},
    ],
  ]) {
    it(
      `${JSON.stringify(entry)} is read and kept`,
      async () => {
        save([entry]);
        const shown = await cli([...ED, 'show', 't']);
        expect(shown.error).toBeUndefined();
        expect(
          (await cli([...ED, 'set', 't', 'corners', 'pill'])).data,
        ).toBeTruthy();
        expect(data().settings).toEqual([
          read,
          {thing: 'corners', value: 'pill', source: 'dial'},
        ]);
      },
      T,
    );
  }
});
