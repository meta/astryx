// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `undo <theme> <word>` with no setting named never leads with a
 * plain step back, which can take back another change than the one typed:
 * a value one setting holds gets that setting's undo, a value several hold
 * gets each one's, a word nothing holds gets a look at the theme, and only
 * `all` or `last` steps back.
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

// The renders are stood in for: these tests are about settings and lines.
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

const file = () => path.join(cwd, 'themes/t/t.settings.json');
const settings = () => JSON.parse(fs.readFileSync(file(), 'utf8')).settings;
const themesHere = () =>
  fs.readdirSync(path.join(cwd, 'themes')).filter(d => !d.startsWith('.'));

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-named-leads-plain-back-',
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
 * @returns {Promise<any>}
 */
const cli = async args =>
  JSON.parse((await runCli([...args, '--json'], cwd)).stdout);

/** The suggestion names. @param {any} r */
const names = r => (r.suggestions ?? []).map((/** @type {any} */ x) => x.name);

/**
 * Run a suggested command as printed (from `experimental` on).
 * @param {string} line
 */
const follow = async line => {
  const args = splitCommand(line.slice(line.indexOf('experimental ')));
  if (!args) throw new Error(`cannot read ${line}`);
  return await cli(args);
};

/** Set each pair on t, in order, through the CLI. @param {string[][]} sets */
const setAll = async sets => {
  for (const s of sets)
    expect((await cli([...ED, 'set', 't', ...s])).error).toBeUndefined();
};

describe('undo t <word> with no setting named', () => {
  it(
    'a value nothing holds gets show t, and no plain step back at all',
    async () => {
      await setAll([
        ['accent', 'red'],
        ['corners', 'pill'],
      ]);
      const r = await cli([...ED, 'undo', 't', 'blue']);
      expect(r.error).toBeDefined();
      expect(names(r)[0]).toMatch(/ show t$/);
      expect(
        names(r).some((/** @type {string} */ n) => / undo t$/.test(n)),
      ).toBe(false);
      expect((await follow(names(r)[0])).error).toBeUndefined();
    },
    T,
  );

  it(
    "a value two settings hold gets each one's undo, and each removes only its own",
    async () => {
      await setAll([
        ['accent', 'red'],
        ['border-color', 'red', '--on', 'card'],
        ['corners', 'pill'],
      ]);
      const r = await cli([...ED, 'undo', 't', 'red']);
      expect(r.error).toBeDefined();
      expect(names(r)).toEqual([
        expect.stringMatching(/ undo t accent red$/),
        expect.stringMatching(/ undo t border-color red --on card$/),
      ]);
      expect((await follow(names(r)[1])).error).toBeUndefined();
      expect(settings().map((/** @type {any} */ s) => s.thing)).toEqual([
        'accent',
        'corners',
      ]);
    },
    T,
  );

  for (const word of ['all', 'last'])
    it(
      `undo t ${word} steps back, saying what it takes back`,
      async () => {
        await setAll([
          ['accent', 'red'],
          ['corners', 'pill'],
        ]);
        const r = await cli([...ED, 'undo', 't', word]);
        expect(r.error).toBeDefined();
        expect(names(r)[0]).toMatch(/ undo t$/);
        expect(r.suggestions[0].reason).toContain('corners = pill');
      },
      T,
    );
});
