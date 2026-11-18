// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Lines `new` offers, options written loosely, words in the other
 * order, a damaged base, font dial words on a part, a theme whose
 * settings files are gone, and a part saved in other letters. Every
 * suggestion is followed, and it works.
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
  cwd = makeLinkedFixture('astryx-theme-hunt120-', FIXTURE_PACKAGES);
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

describe('the lines new offers', () => {
  it(
    'with no name: a free new name, never the theme here',
    async () => {
      const r = await cli([...ED, 'new']);
      expect(r.suggestions[0].name).toMatch(/ editor new my-theme$/);
      expect((await follow(r.suggestions[0].name)).error).toBeUndefined();
      drop('my-theme');
    },
    T,
  );

  it(
    'a font never typed is not offered; the same new without it works',
    async () => {
      const r = await cli([
        ...ED,
        'new',
        'n2',
        '--like',
        'neutral',
        '--font',
        'Georgia,,serif',
      ]);
      for (const x of r.suggestions)
        expect(x.name, x.name).not.toMatch(/--font inter/);
      const line = r.suggestions.find((/** @type {any} */ x) =>
        / editor new n2 --like neutral$/.test(x.name),
      );
      expect(line).toBeTruthy();
      expect((await follow(line.name)).error).toBeUndefined();
      drop('n2');
    },
    T,
  );

  it(
    'a value of another dial is never offered as the refused one; the message names the set for after',
    async () => {
      const r = await cli([
        ...ED,
        'new',
        'n3',
        '--like',
        'neutral',
        '--buttons',
        'pill',
      ]);
      expect(r.error).toContain('set n3 corners pill --on button');
      expect(r.suggestions[0].name).toMatch(/ editor new n3 --like neutral$/);
      expect((await follow(r.suggestions[0].name)).error).toBeUndefined();
      drop('n3');
    },
    T,
  );

  it(
    'on a name that exists, the copy carries only flags new takes',
    async () => {
      for (const flags of [
        ['--text-size', '99'],
        ['--headings', 'bold', '--headings', 'heavy'],
      ]) {
        const r = await cli([...ED, 'new', 't', '--like', 'neutral', ...flags]);
        const copy = r.suggestions.find((/** @type {any} */ x) =>
          / editor new t-2 /.test(x.name),
        );
        expect(copy, flags.join(' ')).toBeTruthy();
        expect((await follow(copy.name)).error, copy.name).toBeUndefined();
        drop('t-2');
      }
    },
    T,
  );

  it(
    'a built-in theme among the extra words is the base',
    async () => {
      for (const words of [
        ['t3', 'like', 'neutral'],
        ['neutral', 't3'],
      ]) {
        const r = await cli([...ED, 'new', ...words]);
        expect(r.suggestions[0].name, words.join(' ')).toMatch(
          / editor new t3 --like neutral$/,
        );
      }
      expect(
        (
          await follow(
            (await cli([...ED, 'new', 't3', 'like', 'neutral'])).suggestions[0]
              .name,
          )
        ).error,
      ).toBeUndefined();
      drop('t3');
    },
    T,
  );
});

describe('options written loosely', () => {
  it(
    'set, undo and new name the option meant and give the command that works',
    async () => {
      const cases = [
        [
          ['set', 't', 'border', '1px solid red', '--On', 'card'],
          / --on card$/,
        ],
        [['set', 't', 'border', '1px solid red', '-on', 'card'], / --on card$/],
        [
          [
            'set',
            't',
            'border',
            '1px solid red',
            '--on',
            'text-input',
            '\u2014only',
          ],
          / --on text-input --only$/,
        ],
      ];
      for (const [args, want] of cases) {
        const r = await cli([...ED, ...args]);
        expect(r.error, args.join(' ')).toContain('did you mean');
        expect(r.suggestions[0].name, args.join(' ')).toMatch(want);
        expect((await follow(r.suggestions[0].name)).error).toBeUndefined();
      }
      // The undo line is checked as undo checks it: --only does not fit
      // card, so the line that works leaves it out.
      const u = await cli([
        ...ED,
        'undo',
        't',
        'border',
        '--on',
        'card',
        '--olny',
      ]);
      expect(u.error).toContain('did you mean --only?');
      expect(u.suggestions[0].name).toMatch(/ editor undo t border --on card$/);
    },
    T,
  );
});

describe('words in the other order', () => {
  it(
    'a token after its value, and neutral base, lead with the set that works',
    async () => {
      const tok = await cli([...ED, 'set', 't', '4px', '--radius-element']);
      expect(tok.suggestions[0].name).toMatch(
        / editor set t --radius-element 4px$/,
      );
      expect((await follow(tok.suggestions[0].name)).error).toBeUndefined();
      const base = await cli([...ED, 'set', 't', 'neutral', 'base']);
      expect(base.suggestions[0].name).toMatch(/ editor set t base neutral$/);
      expect((await follow(base.suggestions[0].name)).error).toBeUndefined();
    },
    T,
  );

  it(
    'a repair never adds a part that was not typed',
    async () => {
      const r = await cli([...ED, 'set', 't', 'heading', 'bold']);
      for (const x of r.suggestions)
        expect(x.name, x.name).not.toMatch(/--on /);
    },
    T,
  );
});

describe('a damaged base', () => {
  it(
    'is set back to the base the theme was built on, which keeps its look',
    async () => {
      edit(d => {
        d.like = 'my-base';
      });
      const r = await cli([...ED, 'show', 't']);
      expect(r.suggestions[0].name).toMatch(/ editor set t base neutral$/);
      expect((await follow(r.suggestions[0].name)).error).toBeUndefined();
      expect(data().like).toBe('neutral');
    },
    T,
  );
});

describe('a font dial word on a part', () => {
  it(
    'gives the family stack it stands for, never the word as a family',
    async () => {
      const r = await cli([...ED, 'set', 't', 'font', 'mono', '--on', 'card']);
      expect(r.suggestions[0].name).toContain(
        `font-family 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' --on card`,
      );
      expect((await follow(r.suggestions[0].name)).error).toBeUndefined();
      const word = await cli([
        ...ED,
        'set',
        't',
        'font-family',
        'mono',
        '--on',
        'card',
      ]);
      expect(word.error).toContain('is a font dial word, not a family');
      expect((await follow(word.suggestions[0].name)).error).toBeUndefined();
    },
    T,
  );
});

describe('a theme whose settings files are both gone', () => {
  it(
    'is the editor’s: new makes it again on its base, and undo then steps back',
    async () => {
      await cli([...ED, 'set', 't', 'corners', 'pill']);
      await cli([...ED, 'set', 't', 'accent', '#7c3aed']);
      fs.rmSync(file());
      fs.rmSync(path.join(cwd, 'themes/t/t.settings.ts'));
      const r = await cli([...ED, 'show', 't']);
      expect(r.error).toContain('the editor made it');
      expect(r.suggestions[0].name).toMatch(/ editor new t --like neutral$/);
      expect((await follow(r.suggestions[0].name)).error).toBeUndefined();
      expect((await cli([...ED, 'undo', 't'])).error).toBeUndefined();
      expect(data().settings).toContainEqual(
        expect.objectContaining({thing: 'corners', value: 'pill'}),
      );
    },
    T,
  );
});

describe('a part saved in other letters or as a one-item list', () => {
  it(
    'is that part: beside the same setting it is listed twice, and its keep line works',
    async () => {
      for (const on of ['Card', ['card']]) {
        fs.writeFileSync(file(), fresh);
        edit(d => {
          d.settings = [
            {thing: 'color', value: 'blue', source: 'property', on: 'card'},
            {thing: 'color', value: 'red', source: 'property', on},
          ];
        });
        const r = await cli([...ED, 'show', 't']);
        expect(r.error, JSON.stringify(on)).toContain('listed twice');
        const keep = r.suggestions.find((/** @type {any} */ x) =>
          / editor set t color blue --on card$/.test(x.name),
        );
        expect(
          (await follow(keep.name)).error,
          JSON.stringify(on),
        ).toBeUndefined();
        expect(data().settings).toEqual([
          expect.objectContaining({value: 'blue', on: 'card'}),
        ]);
      }
    },
    T,
  );
});

describe('undo of a misspelt setting', () => {
  it(
    'leads with the setting of the scope typed',
    async () => {
      await cli([...ED, 'set', 't', 'corners', 'pill', '--on', 'button']);
      await cli([...ED, 'set', 't', 'corners', 'small']);
      const r = await cli([...ED, 'undo', 't', 'cornrs']);
      expect(r.suggestions[0].name).toMatch(/ editor undo t corners$/);
      expect((await follow(r.suggestions[0].name)).error).toBeUndefined();
      expect(data().settings).toEqual([
        expect.objectContaining({thing: 'corners', on: 'button'}),
      ]);
    },
    T,
  );
});

describe('undo with the theme typed after the setting', () => {
  it(
    'gives the reason with the theme first and a command that works',
    async () => {
      const r = await cli([...ED, 'undo', 'corners', 't']);
      expect(r.error).toContain('With t first: t does not set corners');
      expect(r.suggestions[0].name).toMatch(/ editor show t$/);
      expect((await follow(r.suggestions[0].name)).error).toBeUndefined();
    },
    T,
  );
});

describe('a base and its dial in the other order, not installed', () => {
  it(
    'leads with the install, then the set',
    async () => {
      const r = await cli([...ED, 'set', 't', 'butter', 'base']);
      expect(r.suggestions[0].name).toMatch(
        /(npm install|(pnpm|yarn|bun) add) @astryxdesign\/theme-butter$/,
      );
      expect(r.suggestions[1].name).toMatch(/ editor set t base butter$/);
    },
    T,
  );
});
