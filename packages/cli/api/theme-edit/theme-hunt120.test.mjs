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
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
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

const BIN = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../clients/cli/bin/astryx.mjs',
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
const cli = args => {
  const r = spawnSync(process.execPath, [BIN, ...args, '--json'], {
    cwd,
    encoding: 'utf8',
  });
  return JSON.parse(r.stdout);
};

/**
 * Run a suggested editor command as printed (from `experimental` on).
 * @param {string} line
 */
const follow = line => {
  const args = splitCommand(line.slice(line.indexOf('experimental ')));
  if (!args) throw new Error(`cannot read ${line}`);
  return cli(args);
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
    () => {
      const r = cli([...ED, 'new']);
      expect(r.suggestions[0].name).toMatch(/ editor new my-theme$/);
      expect(follow(r.suggestions[0].name).error).toBeUndefined();
      drop('my-theme');
    },
    T,
  );

  it(
    'a font never typed is not offered; the same new without it works',
    () => {
      const r = cli([
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
      expect(follow(line.name).error).toBeUndefined();
      drop('n2');
    },
    T,
  );

  it(
    'a value of another dial is never offered as the refused one; the message names the set for after',
    () => {
      const r = cli([
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
      expect(follow(r.suggestions[0].name).error).toBeUndefined();
      drop('n3');
    },
    T,
  );

  it(
    'on a name that exists, the copy carries only flags new takes',
    () => {
      for (const flags of [
        ['--text-size', '99'],
        ['--headings', 'bold', '--headings', 'heavy'],
      ]) {
        const r = cli([...ED, 'new', 't', '--like', 'neutral', ...flags]);
        const copy = r.suggestions.find((/** @type {any} */ x) =>
          / editor new t-2 /.test(x.name),
        );
        expect(copy, flags.join(' ')).toBeTruthy();
        expect(follow(copy.name).error, copy.name).toBeUndefined();
        drop('t-2');
      }
    },
    T,
  );

  it(
    'a built-in theme among the extra words is the base',
    () => {
      for (const words of [
        ['t3', 'like', 'neutral'],
        ['neutral', 't3'],
      ]) {
        const r = cli([...ED, 'new', ...words]);
        expect(r.suggestions[0].name, words.join(' ')).toMatch(
          / editor new t3 --like neutral$/,
        );
      }
      expect(
        follow(cli([...ED, 'new', 't3', 'like', 'neutral']).suggestions[0].name)
          .error,
      ).toBeUndefined();
      drop('t3');
    },
    T,
  );
});

describe('options written loosely', () => {
  it(
    'set, undo and new name the option meant and give the command that works',
    () => {
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
        const r = cli([...ED, ...args]);
        expect(r.error, args.join(' ')).toContain('did you mean');
        expect(r.suggestions[0].name, args.join(' ')).toMatch(want);
        expect(follow(r.suggestions[0].name).error).toBeUndefined();
      }
      // The undo line is checked as undo checks it: --only does not fit
      // card, so the line that works leaves it out.
      const u = cli([...ED, 'undo', 't', 'border', '--on', 'card', '--olny']);
      expect(u.error).toContain('did you mean --only?');
      expect(u.suggestions[0].name).toMatch(/ editor undo t border --on card$/);
    },
    T,
  );
});

describe('words in the other order', () => {
  it(
    'a token after its value, and neutral base, lead with the set that works',
    () => {
      const tok = cli([...ED, 'set', 't', '4px', '--radius-element']);
      expect(tok.suggestions[0].name).toMatch(
        / editor set t --radius-element 4px$/,
      );
      expect(follow(tok.suggestions[0].name).error).toBeUndefined();
      const base = cli([...ED, 'set', 't', 'neutral', 'base']);
      expect(base.suggestions[0].name).toMatch(/ editor set t base neutral$/);
      expect(follow(base.suggestions[0].name).error).toBeUndefined();
    },
    T,
  );

  it(
    'a repair never adds a part that was not typed',
    () => {
      const r = cli([...ED, 'set', 't', 'heading', 'bold']);
      for (const x of r.suggestions)
        expect(x.name, x.name).not.toMatch(/--on /);
    },
    T,
  );
});

describe('a damaged base', () => {
  it(
    'is set back to the base the theme was built on, which keeps its look',
    () => {
      edit(d => {
        d.like = 'my-base';
      });
      const r = cli([...ED, 'show', 't']);
      expect(r.suggestions[0].name).toMatch(/ editor set t base neutral$/);
      expect(follow(r.suggestions[0].name).error).toBeUndefined();
      expect(data().like).toBe('neutral');
    },
    T,
  );
});

describe('a font dial word on a part', () => {
  it(
    'gives the family stack it stands for, never the word as a family',
    () => {
      const r = cli([...ED, 'set', 't', 'font', 'mono', '--on', 'card']);
      expect(r.suggestions[0].name).toContain(
        `font-family 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' --on card`,
      );
      expect(follow(r.suggestions[0].name).error).toBeUndefined();
      const word = cli([
        ...ED,
        'set',
        't',
        'font-family',
        'mono',
        '--on',
        'card',
      ]);
      expect(word.error).toContain('is a font dial word, not a family');
      expect(follow(word.suggestions[0].name).error).toBeUndefined();
    },
    T,
  );
});

describe('a theme whose settings files are both gone', () => {
  it(
    'is the editor’s: new makes it again on its base, and undo then steps back',
    () => {
      cli([...ED, 'set', 't', 'corners', 'pill']);
      cli([...ED, 'set', 't', 'accent', '#7c3aed']);
      fs.rmSync(file());
      fs.rmSync(path.join(cwd, 'themes/t/t.settings.ts'));
      const r = cli([...ED, 'show', 't']);
      expect(r.error).toContain('the editor made it');
      expect(r.suggestions[0].name).toMatch(/ editor new t --like neutral$/);
      expect(follow(r.suggestions[0].name).error).toBeUndefined();
      expect(cli([...ED, 'undo', 't']).error).toBeUndefined();
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
    () => {
      for (const on of ['Card', ['card']]) {
        fs.writeFileSync(file(), fresh);
        edit(d => {
          d.settings = [
            {thing: 'color', value: 'blue', source: 'property', on: 'card'},
            {thing: 'color', value: 'red', source: 'property', on},
          ];
        });
        const r = cli([...ED, 'show', 't']);
        expect(r.error, JSON.stringify(on)).toContain('listed twice');
        const keep = r.suggestions.find((/** @type {any} */ x) =>
          / editor set t color blue --on card$/.test(x.name),
        );
        expect(follow(keep.name).error, JSON.stringify(on)).toBeUndefined();
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
    () => {
      cli([...ED, 'set', 't', 'corners', 'pill', '--on', 'button']);
      cli([...ED, 'set', 't', 'corners', 'small']);
      const r = cli([...ED, 'undo', 't', 'cornrs']);
      expect(r.suggestions[0].name).toMatch(/ editor undo t corners$/);
      expect(follow(r.suggestions[0].name).error).toBeUndefined();
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
    () => {
      const r = cli([...ED, 'undo', 'corners', 't']);
      expect(r.error).toContain('With t first: t does not set corners');
      expect(r.suggestions[0].name).toMatch(/ editor show t$/);
      expect(follow(r.suggestions[0].name).error).toBeUndefined();
    },
    T,
  );
});

describe('a base and its dial in the other order, not installed', () => {
  it(
    'leads with the install, then the set',
    () => {
      const r = cli([...ED, 'set', 't', 'butter', 'base']);
      expect(r.suggestions[0].name).toMatch(
        /(npm install|(pnpm|yarn|bun) add) @astryxdesign\/theme-butter$/,
      );
      expect(r.suggestions[1].name).toMatch(/ editor set t base butter$/);
    },
    T,
  );
});
