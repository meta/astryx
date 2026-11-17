// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Lines that work as the person will run them: `new` refused for its
 * name keeps each repaired value, a damaged saved entry's set line is
 * offered alone only when it replaces that entry, a base typo installs
 * the base it names, integer properties read thousands, an undo of
 * several settings undoes each, and the settings reader reads a number
 * `only`, a vibrancy with no color and a saved step word as set would.
 * Every line offered is followed, and it works.
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
    'astryx-theme-refused-name-repaired-value-',
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
/** @param {string} name */
const drop = name =>
  fs.rmSync(path.join(cwd, 'themes', name), {recursive: true, force: true});
/** The suggestion names. @param {any} r */
const names = r => (r.suggestions ?? []).map((/** @type {any} */ x) => x.name);

describe('new refused for its name', () => {
  it(
    'keeps each misspelled value as new repairs it for a free name',
    async () => {
      const r = await cli([
        ...ED,
        'new',
        't',
        '--like',
        'neutral',
        '--spacing',
        'romy',
      ]);
      const line = names(r).find((/** @type {string} */ n) =>
        / editor new t-2 /.test(n),
      );
      expect(line).toMatch(/ new t-2 --like neutral --spacing roomy$/);
      expect((await follow(line)).error).toBeUndefined();
      drop('t-2');
    },
    T,
  );
});

describe('new with a stray word after its base', () => {
  it(
    'keeps the base, reading the word into the name',
    async () => {
      const r = await cli([...ED, 'new', 'w', '--like', 'neutral', 'extra']);
      expect(names(r)[0]).toMatch(/ new w-extra --like neutral$/);
      expect((await follow(names(r)[0])).error).toBeUndefined();
      drop('w-extra');
    },
    T,
  );
});

describe('a damaged saved entry', () => {
  it(
    'offers its set line as a second step after the undo when it cannot replace the entry',
    async () => {
      // A dial saved with a mode, which set never writes: set's line
      // cannot replace that entry (a dial name in other letters, once used
      // here, is now read as the dial).
      edit(d => {
        d.settings.push({
          thing: 'corners',
          value: 'pill',
          source: 'dial',
          mode: 'dark',
        });
      });
      const r = await cli([...ED, 'set', 't', '--spacing-4', '12px']);
      expect(r.suggestions[0].name).toMatch(/ undo t corners$/);
      expect(r.suggestions[1].name).toMatch(/ set t corners pill$/);
      expect(r.suggestions[1].reason).toMatch(/^then this/);
      expect((await follow(r.suggestions[0].name)).error).toBeUndefined();
      expect((await follow(r.suggestions[1].name)).error).toBeUndefined();
      expect(data().settings).toContainEqual(
        expect.objectContaining({thing: 'corners', value: 'pill'}),
      );
    },
    T,
  );

  it(
    'a saved only written as 1 or 0 is read as yes or no',
    async () => {
      for (const only of [1, 0]) {
        fs.writeFileSync(file(), fresh);
        edit(d => {
          d.settings.push({
            thing: 'border-color',
            value: 'red',
            source: 'property',
            on: 'date-input',
            only,
          });
        });
        expect(
          (await cli([...ED, 'set', 't', '--spacing-4', '12px'])).error,
        ).toBeUndefined();
      }
    },
    T,
  );

  it(
    'a vibrancy with no color is refused with its undo, as set refuses it',
    async () => {
      edit(d => {
        d.settings = [{thing: 'vibrancy', value: '60', source: 'dial'}];
      });
      const r = await cli([...ED, 'show', 't']);
      expect(r.error).toContain('no color dial is set');
      expect(names(r)[0]).toMatch(/ undo t vibrancy$/);
      expect((await follow(names(r)[0])).error).toBeUndefined();
    },
    T,
  );

  it(
    'a step word saved by hand steps from what applies without it',
    async () => {
      edit(d => {
        d.settings = [{thing: 'spacing', value: 'more', source: 'dial'}];
      });
      const r = await cli([...ED, 'set', 't', 'headings', 'bold']);
      const line = names(r).find((/** @type {string} */ n) =>
        / set t spacing more$/.test(n),
      );
      expect(line).toBeTruthy();
      expect((await follow(line)).error).toBeUndefined();
      expect(data().settings).toEqual([
        expect.objectContaining({thing: 'spacing', value: 'roomy'}),
      ]);
    },
    T,
  );
});

describe('a base that is not installed', () => {
  it(
    'a typo of it leads with its install, then the set; an unknown word gets how, never no base',
    async () => {
      const r = await cli([...ED, 'set', 't', 'base', 'ston']);
      expect(r.suggestions[0].name).toMatch(/@astryxdesign\/theme-stone$/);
      expect(r.suggestions[1].name).toMatch(/ set t base stone$/);
      const n = await cli([...ED, 'new', 'w', '--like', 'ston']);
      expect(names(n)[1]).toMatch(/ new w --like stone$/);
      const foo = await cli([...ED, 'set', 't', 'base', 'foo']);
      for (const x of names(foo)) expect(x).not.toMatch(/ base none$/);
      expect(names(foo)).toContainEqual(expect.stringMatching(/ how base$/));
    },
    T,
  );
});

describe('values read by their kind', () => {
  it(
    'a thousands comma on an integer property, and a decimal comma in a ratio',
    async () => {
      const z = await cli([
        ...ED,
        'set',
        't',
        'z-index',
        '-1,000',
        '--on',
        'card',
      ]);
      expect(names(z)[0]).toMatch(/ set t z-index -1000 --on card$/);
      expect((await follow(names(z)[0])).error).toBeUndefined();
      const a = await cli([
        ...ED,
        'set',
        't',
        'aspect-ratio',
        '0,75',
        '--on',
        'card',
      ]);
      expect(names(a)[0]).toMatch(/ set t aspect-ratio 0\.75 --on card$/);
    },
    T,
  );
});

describe('undo', () => {
  it(
    'of several settings named at once offers one undo each, never a step back',
    async () => {
      await cli([...ED, 'set', 't', 'corners', 'pill']);
      await cli([...ED, 'set', 't', 'padding', '8px', '--on', 'card']);
      await cli([...ED, 'set', 't', 'accent', 'red']);
      const r = await cli([...ED, 'undo', 't', 'corners, padding']);
      expect(names(r)).toEqual([
        expect.stringMatching(/ undo t corners$/),
        expect.stringMatching(/ undo t padding --on card$/),
      ]);
      expect((await follow(names(r)[1])).error).toBeUndefined();
      expect(data().settings).toContainEqual(
        expect.objectContaining({thing: 'accent'}),
      );
    },
    T,
  );

  it(
    'with a scope and nothing to step back to offers show',
    async () => {
      const r = await cli([...ED, 'undo', 't', '--on', 'card']);
      expect(names(r)).toEqual([expect.stringMatching(/ show t$/)]);
    },
    T,
  );
});

describe('a setting pasted as an object', () => {
  it(
    'in the saved form, or beside scope keys, is one setting with its scope as flags',
    async () => {
      const r = await cli([
        ...ED,
        'set',
        't',
        '{"thing":"background-color","value":"red","on":"card","mode":"dark"}',
      ]);
      expect(names(r)).toEqual([
        expect.stringMatching(
          / set t background-color red --on card --mode dark$/,
        ),
      ]);
      expect((await follow(names(r)[0])).error).toBeUndefined();
    },
    T,
  );
});

describe('a mistyped yes/no option followed by a word', () => {
  it(
    'leaves the word out of the line and says so',
    async () => {
      const r = await cli([
        ...ED,
        'set',
        't',
        'background-color',
        'red',
        '--on',
        'text-input',
        '--olny',
        'dark',
      ]);
      expect(r.error).toContain('"dark" after it is no value of --only');
      for (const x of names(r)) expect(x).not.toMatch(/--only dark/);
    },
    T,
  );
});
