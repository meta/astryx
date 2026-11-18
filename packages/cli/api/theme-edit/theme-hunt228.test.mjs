// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file An option typed before one of an experimental theme group's real
 * subcommands (`preview --theme t list`, `editor --mode light set ...`):
 * the refusal names the option and the subcommand, offers the command with
 * the options the subcommand takes after it, and says which it takes none
 * of. An option's value is never read as a subcommand, and the line offered
 * is the subcommand typed, never another one.
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

// The renders are stood in for: these tests are about the command line.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

const T = 240_000;

/** @type {string} */
let cwd;
/** @type {string} */
let fresh;

const file = () => path.join(cwd, 'themes/t/t.settings.json');

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt228-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
  fresh = fs.readFileSync(file(), 'utf8');
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

beforeEach(() => {
  fs.writeFileSync(file(), fresh);
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

describe('an option typed before a real subcommand', () => {
  it(
    'editor --mode light set t background-color red --on card: the option goes after set, and the line runs',
    async () => {
      const r = await cli([
        'experimental',
        'theme',
        'editor',
        '--mode',
        'light',
        'set',
        't',
        'background-color',
        'red',
        '--on',
        'card',
      ]);
      expect(r.code).not.toBe('ERR_UNKNOWN_SUBCOMMAND');
      expect(r.error).not.toMatch(/editor light/);
      expect(r.error).toContain(
        '--mode light goes after the subcommand: experimental theme editor set takes it there.',
      );
      expect(names(r)[0]).toMatch(
        / experimental theme editor set t background-color red --on card --mode light$/,
      );
      const followed = await follow(names(r)[0]);
      expect(followed.error).toBeUndefined();
      const saved = JSON.parse(fs.readFileSync(file(), 'utf8')).settings;
      expect(saved).toEqual([
        expect.objectContaining({
          thing: 'background-color',
          value: 'red',
          on: 'card',
          mode: 'light',
        }),
      ]);
    },
    T,
  );

  it(
    'preview --theme t list: list takes no --theme, so the line is list without it, and it runs',
    async () => {
      const r = await cli([
        'experimental',
        'theme',
        'preview',
        '--theme',
        't',
        'list',
      ]);
      expect(r.code).not.toBe('ERR_UNKNOWN_SUBCOMMAND');
      expect(r.error).not.toMatch(/preview t'/);
      expect(r.error).toContain(
        '--theme t is typed before experimental theme preview list, which takes no such option.',
      );
      expect(names(r)[0]).toMatch(/ experimental theme preview list$/);
      // Never a writing command offered for a read.
      expect(
        names(r).some((/** @type {string} */ n) => / preview add\b/.test(n)),
      ).toBe(false);
      expect((await follow(names(r)[0])).error).toBeUndefined();
    },
    T,
  );

  it(
    'preview --path x list: the option list takes keeps its value after it; one it does not is named',
    async () => {
      const r = await cli([
        'experimental',
        'theme',
        'preview',
        '--path',
        'x',
        'list',
      ]);
      expect(r.code).not.toBe('ERR_UNKNOWN_SUBCOMMAND');
      expect(r.error).toContain(
        '--path x goes after the subcommand: experimental theme preview list takes it there.',
      );
      expect(names(r)[0]).toMatch(/ experimental theme preview list --path x$/);
      // Both at once: the one list takes moves, the other is named.
      const both = await cli([
        'experimental',
        'theme',
        'preview',
        '--theme',
        't',
        '--path',
        'x',
        'list',
      ]);
      expect(both.error).toContain(
        '--theme t is typed before experimental theme preview list, which takes no such option.',
      );
      expect(names(both)[0]).toMatch(
        / experimental theme preview list --path x$/,
      );
    },
    T,
  );

  it(
    'an unknown word before an option is still the unknown subcommand',
    async () => {
      const r = await cli([
        'experimental',
        'theme',
        'preview',
        'path',
        '--theme',
        't',
      ]);
      expect(r.code).toBe('ERR_UNKNOWN_SUBCOMMAND');
      expect(r.error).toContain(
        "unknown subcommand 'experimental theme preview path'",
      );
    },
    T,
  );
});
