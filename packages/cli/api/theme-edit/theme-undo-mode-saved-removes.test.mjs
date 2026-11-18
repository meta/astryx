// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file An undo with no --mode of a setting saved for one mode removes that
 * entry, named with its mode; one saved for each mode gets an undo line per
 * mode. Every line offered is followed, and it works.
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
    'astryx-theme-undo-mode-saved-removes-',
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
/** The suggestion names. @param {any} r */
const names = r => (r.suggestions ?? []).map((/** @type {any} */ x) => x.name);

describe('undo of a setting saved for one mode', () => {
  it(
    'removes that entry and names its mode',
    async () => {
      await cli([
        ...ED,
        'set',
        't',
        '--color-background-body',
        '#FCE7F3',
        '--mode',
        'light',
      ]);
      const r = await cli([...ED, 'undo', 't', '--color-background-body']);
      expect(r.error).toBeUndefined();
      expect(JSON.stringify(r.data)).toContain('light');
      expect(data().settings).toEqual([]);
    },
    T,
  );

  it(
    'saved for each mode, offers one undo per mode',
    async () => {
      await cli([
        ...ED,
        'set',
        't',
        '--color-background-body',
        '#FCE7F3',
        '--mode',
        'light',
      ]);
      await cli([
        ...ED,
        'set',
        't',
        '--color-background-body',
        '#111111',
        '--mode',
        'dark',
      ]);
      const r = await cli([...ED, 'undo', 't', '--color-background-body']);
      expect(r.error).toContain('for each mode on its own');
      expect(names(r)).toEqual([
        expect.stringMatching(/ undo t --color-background-body --mode light$/),
        expect.stringMatching(/ undo t --color-background-body --mode dark$/),
      ]);
      expect((await follow(names(r)[1])).error).toBeUndefined();
      expect(data().settings).toEqual([
        expect.objectContaining({value: '#FCE7F3', mode: 'light'}),
      ]);
    },
    T,
  );
});
