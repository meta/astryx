// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Options and words a theme command does not take, answered one way
 * by every command, and the color tokens offered for a part whose color
 * comes from its color prop, as the prop's doc gives them. Every
 * suggestion that runs is followed, and it works.
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
  cwd = makeLinkedFixture(
    'astryx-theme-options-words-answered-color-',
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

/** The suggestion names. @param {any} r */
const names = r => (r.suggestions ?? []).map((/** @type {any} */ x) => x.name);

describe('an option or words a command does not take', () => {
  it(
    'show names the options it takes and offers the show without it',
    async () => {
      const r = await cli([...ED, 'show', 't', '--zz']);
      expect(r.error).toContain(
        "unknown option '--zz': show takes --section, --png and --json.",
      );
      expect(names(r)[0]).toMatch(/ editor show t$/);
      expect((await follow(names(r)[0])).error).toBeUndefined();
      expect(names(r)[1]).toMatch(/ editor show --help$/);
    },
    T,
  );

  it(
    'set names its options and what a design token is, with its help only',
    async () => {
      const r = await cli([...ED, 'set', 't', 'border', '1px', '--zz']);
      expect(r.error).toMatch(
        /^unknown option '--zz': set takes .*--on.*; a design token/,
      );
      expect(names(r)).toEqual([expect.stringMatching(/ editor set --help$/)]);
    },
    T,
  );

  it(
    'words past what show takes are named, with its help',
    async () => {
      const r = await cli([...ED, 'show', 't', 'extra']);
      expect(r.error).toContain('show does not take "extra"');
      expect(names(r)).toEqual([expect.stringMatching(/ editor show --help$/)]);
    },
    T,
  );

  it(
    'preview remove offers no line without the option, which would remove the whole preview',
    async () => {
      const r = await cli([
        'experimental',
        'theme',
        'preview',
        'remove',
        '--zzz',
        'x',
      ]);
      expect(r.error).toMatch(/^unknown option '--zzz': preview remove takes /);
      expect(names(r)).toEqual([
        expect.stringMatching(/ theme preview remove --help$/),
      ]);
    },
    T,
  );

  it(
    'a preview app folder that starts with "-" gets the line with --',
    async () => {
      const r = await cli(['experimental', 'theme', 'preview', 'app', '-foo']);
      expect(r.error).toContain(
        'a folder name that starts with "-" goes after --',
      );
      expect(names(r)[0]).toMatch(/ theme preview app -- -foo$/);
    },
    T,
  );
});

describe('a color on a part whose color comes from its color prop', () => {
  it(
    "offers the prop's default token, else each color token the part reads",
    async () => {
      const text = await cli([
        ...ED,
        'set',
        't',
        'color',
        '#123456',
        '--on',
        'text',
      ]);
      expect(names(text)).toEqual([
        expect.stringMatching(
          / editor set t --color-text-primary '#123456' --on text$/,
        ),
        expect.stringMatching(
          / editor set t --color-text-secondary '#123456' --on text$/,
        ),
        expect.stringMatching(
          / editor set t --color-text-disabled '#123456' --on text$/,
        ),
        expect.stringMatching(
          / editor set t --color-text-accent '#123456' --on text$/,
        ),
      ]);
      expect((await follow(names(text)[0])).error).toBeUndefined();
      const link = await cli([
        ...ED,
        'set',
        't',
        'color',
        '#123456',
        '--on',
        'link',
      ]);
      expect(names(link)).toEqual([
        expect.stringMatching(
          / editor set t --color-text-accent '#123456' --on link$/,
        ),
      ]);
    },
    T,
  );
});
