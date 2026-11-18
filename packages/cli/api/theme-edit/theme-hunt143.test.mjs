// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A pasted object's keys read as set reads a typed thing: a key with
 * spaces around it is that setting, alone or beside others. Every line
 * offered is followed, and it works.
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
  cwd = makeLinkedFixture('astryx-theme-hunt143-', FIXTURE_PACKAGES);
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

describe('a pasted object whose key has spaces around it', () => {
  it(
    'alone, is that setting',
    async () => {
      const r = await cli([...ED, 'set', 't', '{"accent ": "#7c3aed"}']);
      expect(r.error).toBeUndefined();
      expect(data().settings).toContainEqual(
        expect.objectContaining({thing: 'accent', value: '#7c3aed'}),
      );
    },
    T,
  );

  it(
    'beside another entry, gets its own line with the key read',
    async () => {
      const r = await cli([
        ...ED,
        'set',
        't',
        '{"accent ": "#7c3aed", "corners": "pill"}',
      ]);
      expect(names(r)[0]).toMatch(/ editor set t accent '#7c3aed'$/);
      expect((await follow(names(r)[0])).error).toBeUndefined();
    },
    T,
  );
});
