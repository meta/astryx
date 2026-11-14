// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A mistyped part, boolean options written with a value, a dial and
 * its value in the other order, a setting listed twice by hand (undo, a
 * bad twin, a keep line set refuses), `only` on a setting that is no group
 * member, and a deleted palette config. Every suggestion is followed, and
 * it works.
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
  cwd = makeLinkedFixture('astryx-theme-hunt115-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd});
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
const settings = () => JSON.parse(fs.readFileSync(file(), 'utf8')).settings;
/** @param {(s: any[]) => void} fn */
const edit = fn => {
  const d = JSON.parse(fs.readFileSync(file(), 'utf8'));
  fn(d.settings);
  fs.writeFileSync(file(), JSON.stringify(d, null, 2));
};

describe('a mistyped part', () => {
  it(
    'is read as the whole part name, never a group one word of it names',
    async () => {
      for (const [typed, part] of [
        ['nmber-input', 'number-input'],
        ['tex-input', 'text-input'],
        ['banner-contnt', 'banner-content'],
      ]) {
        const r = await cli([
          ...ED,
          'set',
          't',
          'border',
          '1px solid red',
          '--on',
          typed,
        ]);
        expect(r.suggestions[0].name, typed).toMatch(
          new RegExp(` --on ${part}$`),
        );
        expect(
          (await follow(r.suggestions[0].name)).error,
          typed,
        ).toBeUndefined();
      }
      const none = await cli([
        ...ED,
        'set',
        't',
        'border',
        '1px solid red',
        '--on',
        'foo-field',
      ]);
      expect(
        none.suggestions.map((/** @type {any} */ x) => x.name),
      ).not.toContainEqual(expect.stringMatching(/--on inputs$/));
    },
    T,
  );
});

describe('a boolean option written with a value', () => {
  it(
    'set, undo and new name the option and give the command that works',
    async () => {
      const on = await cli([
        ...ED,
        'set',
        't',
        'border',
        '1px solid red',
        '--on',
        'text-input',
        '--only=true',
      ]);
      expect(on.error).toContain('--only takes no value');
      expect(on.suggestions[0].name).toMatch(/ --on text-input --only$/);
      expect((await follow(on.suggestions[0].name)).error).toBeUndefined();
      const spaced = await cli([
        ...ED,
        'set',
        't',
        'spacing',
        'tight',
        '--png',
        'false',
      ]);
      expect(spaced.suggestions[0].name).toMatch(
        / editor set t spacing tight$/,
      );
      expect((await follow(spaced.suggestions[0].name)).error).toBeUndefined();
      const undo = await cli([...ED, 'undo', 't', 'spacing', '--png=false']);
      expect(undo.suggestions[0].name).toMatch(/ editor undo t spacing$/);
      const made = await cli([...ED, 'new', 't2', '--png=false']);
      expect(made.suggestions[0].name).toMatch(/ editor new t2$/);
      expect((await follow(made.suggestions[0].name)).error).toBeUndefined();
    },
    T,
  );
});

describe('a dial and its value in the other order', () => {
  it(
    'leads with the set in the right order, which works',
    async () => {
      const r = await cli([...ED, 'set', 't', 'round', 'corners']);
      expect(r.suggestions[0].name).toMatch(/ editor set t corners round$/);
      expect((await follow(r.suggestions[0].name)).error).toBeUndefined();
      const all = await cli([...ED, 'set', 'pill', 'corners', 't']);
      expect(all.suggestions[0].name).toMatch(/ editor set t corners pill$/);
      expect(all.suggestions[0].reason).not.toContain('still needs a fix');
      expect((await follow(all.suggestions[0].name)).error).toBeUndefined();
    },
    T,
  );
});

describe('a setting listed twice by hand', () => {
  it(
    'undo names every entry it removes',
    async () => {
      await cli([...ED, 'set', 't', 'border', '1px solid red', '--on', 'card']);
      edit(s =>
        s.push({
          thing: 'border',
          value: '2px dashed blue',
          source: 'property',
          on: 'card',
        }),
      );
      const r = await cli([...ED, 'undo', 't', 'border', '--on', 'card']);
      expect(r.data.notes).toContain(
        'border on card was listed twice (1px solid red, 2px dashed blue); each is removed',
      );
    },
    T,
  );

  it(
    'a bad twin of a good entry is named as listed twice, and its keep line keeps the good one',
    async () => {
      await cli([...ED, 'set', 't', 'corners', 'pill']);
      edit(s => s.push({thing: 'corners', value: 'banana', source: 'dial'}));
      const r = await cli([...ED, 'show', 't']);
      expect(r.error).toContain('is listed twice');
      const keep = r.suggestions.find((/** @type {any} */ x) =>
        / editor set t corners pill$/.test(x.name),
      );
      expect(keep).toBeTruthy();
      expect((await follow(keep.name)).error).toBeUndefined();
      expect(
        settings().filter((/** @type {any} */ x) => x.thing === 'corners'),
      ).toEqual([expect.objectContaining({value: 'pill'})]);
    },
    T,
  );

  it(
    'a headings word saved under the other half is read as that half, so no good entry is lost',
    async () => {
      await cli([...ED, 'set', 't', 'headings', 'bold']);
      edit(s => s.push({thing: 'headings', value: 'tight', source: 'dial'}));
      const r = await cli([...ED, 'set', 't', 'spacing', 'roomy']);
      expect(r.error).toBeUndefined();
      expect(r.data.notes).toContain(
        'headings "tight" was saved under weight, read as tracking',
      );
      expect(
        settings().filter((/** @type {any} */ x) => x.thing === 'headings'),
      ).toHaveLength(2);
    },
    T,
  );

  it(
    'a keep line whose value set refuses is not offered',
    async () => {
      await cli([...ED, 'set', 't', 'border', '1px solid red', '--on', 'card']);
      edit(s =>
        s.push({
          thing: 'border',
          value: '1px solid nope',
          source: 'property',
          on: 'card',
        }),
      );
      const r = await cli([...ED, 'show', 't']);
      const names = r.suggestions.map((/** @type {any} */ x) => x.name);
      expect(names).not.toContainEqual(expect.stringMatching(/nope/));
      for (const line of names.filter((/** @type {string} */ n) =>
        / editor set /.test(n),
      ))
        expect((await follow(line)).error, line).toBeUndefined();
    },
    T,
  );
});

describe('only on a setting that is no group member', () => {
  it(
    'is refused with the undo of that entry, which works and leaves the base value',
    async () => {
      await cli([...ED, 'set', 't', 'corners', 'pill']);
      edit(s => {
        s.find(x => x.thing === 'corners').only = true;
      });
      const r = await cli([...ED, 'show', 't']);
      expect(r.error).toContain('has only, which is for one member of a group');
      expect(r.suggestions[0].name).toMatch(/ editor undo t corners$/);
      expect((await follow(r.suggestions[0].name)).error).toBeUndefined();
      expect(settings()).toEqual([]);
    },
    T,
  );
});

describe('a deleted palette config', () => {
  it(
    'show writes it again, as every generated file',
    async () => {
      await cli([...ED, 'set', 't', 'accent', '#7c3aed']);
      const config = path.join(cwd, 'themes/t/palette.config.json');
      fs.rmSync(config);
      expect((await cli([...ED, 'show', 't'])).error).toBeUndefined();
      expect(fs.existsSync(config)).toBe(true);
    },
    T,
  );
});

describe('a settings file that cannot be read', () => {
  it(
    'is made again on the base it was built on, and that line works',
    async () => {
      await cli([...ED, 'new', 'nb', '--like', 'neutral']);
      const f = path.join(cwd, 'themes/nb/nb.settings.json');
      fs.writeFileSync(f, '{"name":"nb","like":"neutral","settings":[');
      const r = await cli([...ED, 'show', 'nb']);
      expect(r.code).toBe('ERR_THEME_INVALID');
      expect(r.suggestions[0].name).toMatch(/ editor new nb --like neutral$/);
      expect((await follow(r.suggestions[0].name)).error).toBeUndefined();
      expect(JSON.parse(fs.readFileSync(f, 'utf8')).like).toBe('neutral');
    },
    T,
  );
});

describe('--like in other letters', () => {
  it(
    'is the base it names, as set base reads it',
    async () => {
      expect(
        (await cli([...ED, 'new', 'lk', '--like', 'Neutral'])).error,
      ).toBeUndefined();
      expect(
        JSON.parse(
          fs.readFileSync(path.join(cwd, 'themes/lk/lk.settings.json'), 'utf8'),
        ).like,
      ).toBe('neutral');
      expect(
        (await cli([...ED, 'new', 'lk2', '--like', 'NONE'])).error,
      ).toBeUndefined();
    },
    T,
  );
});
