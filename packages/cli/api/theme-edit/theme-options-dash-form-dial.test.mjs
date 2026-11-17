// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Options with any dash form, a dial name with a space, an empty
 * thing, a typo as near two values, system font typos, a headings typo on
 * undo, show and undo on a damaged entry, a saved base typo of an
 * uninstalled base, an entry saved in a typed form, and the change an undo
 * leaves on top. Every line offered is followed, and it works.
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
    'astryx-theme-options-dash-form-dial-',
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
/** @param {(d: any) => void} fn */
const edit = fn => {
  const d = data();
  fn(d);
  fs.writeFileSync(file(), JSON.stringify(d, null, 2));
};
/** The suggestion names. @param {any} r */
const names = r => (r.suggestions ?? []).map((/** @type {any} */ x) => x.name);

describe('the one option reader', () => {
  it(
    'reads a hyphen before a dash, and minus signs, as the option',
    async () => {
      for (const dash of ['-\u2014on', '\u2212\u2212on']) {
        const r = await cli([
          ...ED,
          'set',
          't',
          'font',
          'Georgia',
          dash,
          'heading',
        ]);
        expect(r.error, dash).toContain('did you mean --on?');
        expect(names(r)[0]).toMatch(/ set t font Georgia --on heading$/);
      }
      expect(data().settings).toEqual([]);
    },
    T,
  );
});

describe('setting names', () => {
  it(
    'a dial name with a space for its dash is the dial',
    async () => {
      expect(
        (await cli([...ED, 'set', 't', 'text size', '18'])).error,
      ).toBeUndefined();
      expect(data().settings).toContainEqual(
        expect.objectContaining({thing: 'text-size', value: '18'}),
      );
    },
    T,
  );

  it(
    'with no thing, points to the settings it takes',
    async () => {
      const r = await cli([...ED, 'set', 't', '', 'pill']);
      expect(names(r)).toEqual([expect.stringMatching(/ how --list dials$/)]);
      expect((await follow(names(r)[0])).error).toBeUndefined();
    },
    T,
  );
});

describe('values', () => {
  it(
    'a typo as near two values offers each',
    async () => {
      const r = await cli([...ED, 'set', 't', 'headings', 'tightr']);
      expect(
        names(r).filter((/** @type {string} */ n) => / set /.test(n)),
      ).toEqual([
        expect.stringMatching(/ set t headings tight$/),
        expect.stringMatching(/ set t headings tighter$/),
      ]);
    },
    T,
  );

  it(
    'a family near a system font is kept as typed, with the line that sets the system font',
    async () => {
      // The editor cannot tell a typo of a system font from a real family
      // it does not know (Corben is no Corbel): it keeps it, and says.
      const r = await cli([...ED, 'set', 't', 'font', 'arail']);
      expect(r.error).toBeUndefined();
      expect(r.data.setting.value).toBe('arail');
      const line =
        /\S+ (?:\S+ )*?experimental theme editor set t font arial/.exec(
          r.data.notes.join('\n'),
        )?.[0];
      expect(line).toBeDefined();
      expect((await follow(String(line))).error).toBeUndefined();
    },
    T,
  );

  it(
    'undo of headings with a typo removes the half its reading names',
    async () => {
      await cli([...ED, 'set', 't', 'headings', 'bold']);
      await cli([...ED, 'set', 't', 'headings', 'wide']);
      const r = await cli([...ED, 'undo', 't', 'headings', 'wdie']);
      expect(names(r)).toEqual([
        expect.stringMatching(/ undo t headings wide$/),
      ]);
      expect((await follow(names(r)[0])).error).toBeUndefined();
      expect(data().settings).toEqual([
        expect.objectContaining({thing: 'headings', value: 'bold'}),
      ]);
    },
    T,
  );
});

describe('a damaged saved value', () => {
  it(
    'show and undo with no history offer its undo and set repair',
    async () => {
      edit(d => {
        d.settings.push({thing: 'corners', value: 'pilll', source: 'dial'});
      });
      for (const args of [
        ['show', 't'],
        ['undo', 't'],
      ]) {
        const r = await cli([...ED, ...args]);
        expect(names(r), args.join(' ')).toEqual([
          expect.stringMatching(/ undo t corners$/),
          expect.stringMatching(/ set t corners pill$/),
        ]);
      }
      expect(
        (await follow(names(await cli([...ED, 'show', 't']))[1])).error,
      ).toBeUndefined();
    },
    T,
  );

  it(
    'a saved base in other letters of an uninstalled base leads with its install',
    async () => {
      edit(d => {
        d.like = 'Stone';
      });
      const r = await cli([...ED, 'show', 't']);
      expect(r.error).toContain('reads as stone');
      expect(r.suggestions[0].reason).toBe('install it');
      expect(names(r)[1]).toMatch(/ set t base stone$/);
    },
    T,
  );

  it(
    'an entry saved in a typed form is read as that setting',
    async () => {
      edit(d => {
        d.settings.push(
          {thing: 'spacing', value: 'roomy', source: 'dial'},
          {corners: 'pill'},
        );
      });
      expect(
        (await cli([...ED, 'set', 't', 'headings', 'bold'])).error,
      ).toBeUndefined();
      expect(data().settings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({thing: 'spacing', value: 'roomy'}),
          expect.objectContaining({thing: 'corners', value: 'pill'}),
        ]),
      );
    },
    T,
  );
});

describe('undo', () => {
  it(
    'names the change now on top, which the next undo takes back',
    async () => {
      await cli([...ED, 'set', 't', 'accent', '#b5572f']);
      await cli([...ED, 'set', 't', 'neutral', '#78716c']);
      const r = await cli([...ED, 'undo', 't']);
      expect(r.data.next).toBe(
        'the change before this, accent = #b5572f (whole theme), is next; undo again to take it back too',
      );
    },
    T,
  );
});
