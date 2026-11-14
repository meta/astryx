// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Recovery lines for a settings file new does not remake, values
 * new repairs as set does, words of a flag value typed unquoted, options
 * of show and preview read one way, a base that is not installed, case
 * fixes of a part and its variant together, and a corners size saved in
 * rem. Every suggestion is followed, and it works.
 *
 * @position api/theme-edit — tests
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
  cwd = makeLinkedFixture('astryx-theme-hunt128-', FIXTURE_PACKAGES);
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
/** @param {(d: any) => void} fn */
const edit = fn => {
  const d = data();
  fn(d);
  fs.writeFileSync(file(), JSON.stringify(d, null, 2));
};
/** @param {string} name */
const drop = name =>
  fs.rmSync(path.join(cwd, 'themes', name), {recursive: true, force: true});

/** The suggestion names, text or JSON. @param {any} r */
const names = r => (r.suggestions ?? []).map((/** @type {any} */ x) => x.name);

describe('a settings file new does not remake', () => {
  it(
    'a setting listed twice offers its keep and remove lines, never a new that is refused',
    async () => {
      edit(d => {
        d.settings = [
          {thing: 'corners', value: 'pill', source: 'dial'},
          {thing: 'corners', value: 'square', source: 'dial'},
        ];
      });
      const r = await cli([...ED, 'set', 't', '--spacing-4', '12px']);
      expect(r.error).not.toContain(' new ');
      for (const n of names(r)) expect(n, n).not.toMatch(/ editor new /);
      const keep = names(r).find((/** @type {string} */ n) =>
        / set t corners pill$/.test(n),
      );
      expect((await follow(keep)).error).toBeUndefined();
      expect(data().settings).toEqual([
        expect.objectContaining({thing: 'corners', value: 'pill'}),
      ]);
    },
    T,
  );

  it(
    'a lifted field that is no list of text is dropped, and the change goes through',
    async () => {
      for (const lifted of ['x', [1]]) {
        fs.writeFileSync(file(), fresh);
        edit(d => {
          d.lifted = lifted;
        });
        const r = await cli([...ED, 'set', 't', 'corners', 'pill']);
        expect(r.error, JSON.stringify(lifted)).toBeUndefined();
        const after = data().lifted;
        expect(
          after == null ||
            (Array.isArray(after) && after.every(x => typeof x === 'string')),
        ).toBe(true);
      }
    },
    T,
  );
});

describe('values new repairs as set does', () => {
  it(
    'a color named in two words never adds a mode, and the line that works leads',
    async () => {
      const r = await cli([
        ...ED,
        'new',
        'u',
        '--like',
        'neutral',
        '--accent',
        'dark blue',
      ]);
      for (const n of names(r)) expect(n, n).not.toMatch(/--mode/);
      expect(names(r)[0]).toMatch(
        / editor new u --like neutral --accent darkblue$/,
      );
      expect((await follow(names(r)[0])).error).toBeUndefined();
      drop('u');
    },
    T,
  );

  it(
    'one word of the value is never a did-you-mean; what the setting takes is named',
    async () => {
      for (const v of ['light red', 'navy blue']) {
        const r = await cli([
          ...ED,
          'new',
          'u',
          '--like',
          'neutral',
          '--accent',
          v,
        ]);
        for (const x of r.suggestions)
          if (x.reason === 'did you mean') expect.fail(`${v}: ${x.name}`);
        expect(names(r), v).toContainEqual(
          expect.stringMatching(/ editor how accent$/),
        );
      }
    },
    T,
  );

  it(
    'a hex without its # keeps the accent in the line',
    async () => {
      const r = await cli([
        ...ED,
        'new',
        'w',
        '--like',
        'neutral',
        '--accent',
        'ff0000',
      ]);
      expect(names(r)[0]).toMatch(
        / editor new w --like neutral --accent '#ff0000'$/,
      );
      expect((await follow(names(r)[0])).error).toBeUndefined();
      drop('w');
    },
    T,
  );
});

describe('words of a flag value typed unquoted on new', () => {
  it(
    'belong to that value, never to the name, and the line is checked',
    async () => {
      const cases = [
        [['--font', 'Open', 'Sans'], / editor new n2 --font 'Open Sans'$/],
        [['--accent', 'dark', 'blue'], / editor new n2 --accent darkblue$/],
        [['--text-size', '16', 'px'], / editor new n2 --text-size 16$/],
      ];
      for (const [flags, want] of cases) {
        const r = await cli([
          ...ED,
          'new',
          'n2',
          .../** @type {string[]} */ (flags),
        ]);
        expect(names(r)[0], flags.join(' ')).toMatch(want);
        expect((await follow(names(r)[0])).error).toBeUndefined();
        drop('n2');
      }
    },
    T,
  );
});

describe('options of show and preview', () => {
  it(
    'show never guesses past the one typo limit, and its line runs',
    async () => {
      const r = await cli([...ED, 'show', 't', '--pgn']);
      expect(r.error).not.toContain('did you mean');
      expect(names(r)[0]).toMatch(/ editor show t$/);
    },
    T,
  );

  it(
    'preview names the option meant with the command, or its help',
    async () => {
      const r = await cli([
        'experimental',
        'theme',
        'preview',
        'list',
        '--paht',
        'x',
      ]);
      expect(r.error).toContain('did you mean --path?');
      expect(names(r)[0]).toMatch(/ theme preview list --path x$/);
      const s = await cli([
        'experimental',
        'theme',
        'preview',
        'remove',
        '--pth',
        'x',
      ]);
      expect(names(s)).toEqual([
        expect.stringMatching(/ theme preview remove --help$/),
      ]);
    },
    T,
  );
});

describe('a base that is not installed', () => {
  it(
    'leads with the install, then the set, and never offers no base to a theme on one',
    async () => {
      const r = await cli([...ED, 'set', 't', 'base', 'stone']);
      expect(r.suggestions[0].name).toMatch(/@astryxdesign\/theme-stone$/);
      expect(r.suggestions[0].reason).toBe('install it');
      expect(r.suggestions[1].name).toMatch(/ editor set t base stone$/);
      expect(r.suggestions[1].reason).toMatch(/^then /);
      for (const n of names(r)) expect(n, n).not.toMatch(/ base none$/);
    },
    T,
  );
});

describe('a part and its variant in other letters', () => {
  it(
    'gives the line with both read as set reads them',
    async () => {
      const r = await cli([
        ...ED,
        'set',
        't',
        'color',
        'red',
        '--on',
        'Button',
        '--when',
        'Variant:Primary',
      ]);
      expect(names(r)[0]).toMatch(
        / editor set t color red --on button --when variant:primary$/,
      );
      expect((await follow(names(r)[0])).error).toBeUndefined();
    },
    T,
  );
});

describe('a corners size saved in rem', () => {
  it(
    'is read as the px set saves it as, and a step goes one rung up from it',
    async () => {
      edit(d => {
        d.settings = [{thing: 'corners', value: '0.5rem', source: 'dial'}];
      });
      expect((await cli([...ED, 'show', 't'])).error).toBeUndefined();
      expect(
        (await cli([...ED, 'set', 't', 'corners', 'more'])).error,
      ).toBeUndefined();
      expect(data().settings).toEqual([
        expect.objectContaining({thing: 'corners', value: 'medium'}),
      ]);
    },
    T,
  );
});
