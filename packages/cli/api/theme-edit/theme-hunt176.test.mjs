// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every contrast problem is listed (the text counts the rest), and a
 * change's new problems are the ones the settings before it, as read, did
 * not have. A fix line sets what draws the text, in the variant it is drawn
 * in, so following it clears the problem; a part's own text color is
 * measured. Saved spellings are read one way on every path, a dial name
 * in other letters is the dial, and offered lines work as offered.
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
  cwd = makeLinkedFixture('astryx-theme-hunt176-', FIXTURE_PACKAGES);
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

describe('every problem', () => {
  it(
    'is listed in JSON, the text counts past the first eight, and new is measured against all of them',
    async () => {
      const r = await cli([
        ...ED,
        'set',
        't',
        'background-color',
        '#ffff66',
        '--on',
        'badge',
      ]);
      expect(r.data.newProblems.length).toBeGreaterThan(8);
      expect(r.data.newProblems.every((/** @type {any} */ p) => p.fix)).toBe(
        true,
      );
      const all = await open();
      expect(all.length).toBe(r.data.newProblems.length);
      expect(
        all.some((/** @type {any} */ p) => /more text pair/.test(p.problem)),
      ).toBe(false);
      const shown = await text([...ED, 'show', 't']);
      expect(shown).toContain(
        `and ${all.length - 8} more (--json lists every one, each with its fix)`,
      );
      // Following one fix makes nothing new: what was failing before was
      // counted before.
      const draft = all.find((/** @type {any} */ p) =>
        p.problem.includes('("Draft")'),
      );
      const after = await follow(draft.fix);
      expect(after.error).toBeUndefined();
      expect(after.data.newProblems).toEqual([]);
    },
    T,
  );
});

describe('fix lines', () => {
  it(
    'set the plain color that wins over a token, and following it clears the problem',
    async () => {
      const r = await cli([
        ...ED,
        'set',
        't',
        'color',
        '#555555',
        '--on',
        'badge',
        '--when',
        'variant:info',
        '--mode',
        'dark',
      ]);
      const [p] = r.data.newProblems;
      expect(p.fix).toMatch(
        / set t color '#(000000|ffffff)' --on badge --when variant:info --mode dark$/,
      );
      expect((await follow(p.fix)).error).toBeUndefined();
      expect(await open()).toEqual([]);
    },
    T,
  );

  it(
    'measure text written straight in a part against its fill',
    async () => {
      const r = await cli([
        ...ED,
        'set',
        't',
        'color',
        '#ff0000',
        '--on',
        'card',
        '--mode',
        'dark',
      ]);
      const p = r.data.newProblems.find((/** @type {any} */ x) =>
        x.problem.startsWith('text in card ("text written straight in it")'),
      );
      expect(p.fix).toMatch(/ set t color '#ffffff' --on card --mode dark$/);
      expect((await follow(p.fix)).error).toBeUndefined();
      expect(await open()).toEqual([]);
    },
    T,
  );

  it(
    'scope a token to the variant the text is drawn in, so following every fix settles',
    async () => {
      await cli([
        ...ED,
        'set',
        't',
        'background-color',
        'red',
        '--on',
        'button',
      ]);
      for (let round = 0; round < 3; round++) {
        const fixes = [
          ...new Set(
            (await open()).map((/** @type {any} */ p) => p.fix).filter(Boolean),
          ),
        ];
        if (!fixes.length) break;
        for (const f of fixes) expect((await follow(f)).error).toBeUndefined();
      }
      expect(await open()).toEqual([]);
    },
    T,
  );
});

describe('saved spellings', () => {
  it(
    'a base in other letters is read as the base for the check, and show says what it reads as',
    async () => {
      edit(d => {
        d.like = 'Neutral';
      });
      const shown = await cli([...ED, 'show', 't']);
      expect(shown.error).toContain('base "Neutral" reads as neutral.');
      expect(names(shown)).toEqual([
        expect.stringMatching(/ set t base neutral$/),
      ]);
      const r = await cli([...ED, 'set', 't', 'corners', 'pill']);
      expect(r.data.notChecked).toBeNull();
      expect(r.data.newProblems).toEqual([]);
    },
    T,
  );

  it(
    'an entry with a thing and no value is removed by its undo line',
    async () => {
      edit(d => {
        d.settings.push(
          {thing: 'corners', value: 'pill', source: 'dial'},
          {thing: 'spacing', source: 'dial'},
        );
      });
      const r = await cli([...ED, 'show', 't']);
      expect(names(r)).toEqual([expect.stringMatching(/ undo t spacing$/)]);
      expect((await follow(names(r)[0])).error).toBeUndefined();
      expect(data().settings).toEqual([
        expect.objectContaining({thing: 'corners', value: 'pill'}),
      ]);
    },
    T,
  );

  it(
    'a dial name in other letters is the dial',
    async () => {
      for (const [thing, value] of [
        ['Corners', 'pill'],
        ['Text-Size', '18'],
        ['MODE', 'dark-only'],
      ])
        expect(
          (await cli([...ED, 'set', 't', thing, value])).error,
          thing,
        ).toBeUndefined();
    },
    T,
  );
});

describe('offered lines', () => {
  it(
    'a theme typo on a step back with nothing to undo offers show, not a failing undo',
    async () => {
      await themeEditNew('brand', {cwd, like: 'neutral'});
      const r = await cli([...ED, 'undo', 'barnd']);
      expect(names(r)[0]).toMatch(/ show brand$/);
      expect(r.suggestions[0].reason).toContain(
        'brand has no earlier change to undo',
      );
      fs.rmSync(path.join(cwd, 'themes/brand'), {recursive: true, force: true});
    },
    T,
  );

  it(
    "new's set repair for a theme it did not make follows a new line, as its next step",
    async () => {
      const r = await cli([
        ...ED,
        'new',
        'n',
        '--like',
        'neutral',
        '--accent',
        'red, blue',
      ]);
      expect(r.suggestions[0].name).toMatch(
        / new n --like neutral --accent red$/,
      );
      const setLine = r.suggestions.find((/** @type {any} */ x) =>
        / set n /.test(x.name),
      );
      expect(setLine.reason).toBe(
        'then this, once a new line above has made n',
      );
    },
    T,
  );
});
