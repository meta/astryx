// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The contrast check measures what draws the text: toast text on
 * Core's media surface reads the on-dark or on-light color, a color given
 * as a theme token reads that token's value in each mode, and pairs on
 * different parts are each their own problem. Following every fix line
 * clears its problem and makes none.
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
  cwd = makeLinkedFixture('astryx-theme-hunt190-', FIXTURE_PACKAGES);
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

/**
 * Follow every fix line show lists until none is left; the problems each
 * step made.
 * @returns {Promise<any[]>}
 */
const followAll = async () => {
  const made = [];
  for (let round = 0; round < 40; round++) {
    const left = await open();
    const next = left.find((/** @type {any} */ p) => p.fix);
    if (!next) break;
    const r = await follow(next.fix);
    expect(r.error, next.fix).toBeUndefined();
    made.push(...(r.data.newProblems ?? []));
  }
  return made;
};

describe('toast text on its media surface', () => {
  it(
    'is measured by the on-dark color it reads, and its fix clears it',
    async () => {
      const r = await cli([
        ...ED,
        'set',
        't',
        '--color-on-dark',
        '#2a2a2a',
        '--on',
        'toast',
      ]);
      const toast = r.data.newProblems.filter((/** @type {any} */ p) =>
        p.problem.startsWith('text in toast'),
      );
      expect(toast.length).toBeGreaterThan(0);
      expect(toast[0].problem).toContain('#2a2a2a');
      expect(toast[0].fix).toContain('--color-on-dark');
      expect(toast[0].fix).toContain('--on toast');
      expect(await followAll()).toEqual([]);
      expect(await open()).toEqual([]);
    },
    T,
  );
});

describe('a color given as a theme token', () => {
  it(
    'is measured as the value the token has in each mode, and its fixes clear it',
    async () => {
      const r = await cli([
        ...ED,
        'set',
        't',
        'background-color',
        'var(--color-text-primary)',
        '--on',
        'card',
      ]);
      const card = r.data.newProblems.filter((/** @type {any} */ p) =>
        p.problem.includes("card's"),
      );
      expect(card.length).toBeGreaterThan(0);
      const shown = await text([...ED, 'show', 't']);
      expect(shown).not.toContain('cannot read as one fixed color');
      expect(await followAll()).toEqual([]);
      expect(await open()).toEqual([]);
    },
    T,
  );
});

describe('pairs on different parts', () => {
  it(
    'are each their own problem, and following each fix makes no new one',
    async () => {
      await cli([...ED, 'set', 't', '--color-text-secondary', '#c8c8c8']);
      const before = await open();
      const parts = new Set(
        before
          .filter((/** @type {any} */ p) =>
            p.problem.startsWith('text in text'),
          )
          .map((/** @type {any} */ p) => /--on ([\w-]+)/.exec(p.fix)?.[1]),
      );
      expect(parts.size).toBeGreaterThan(1);
      expect(await followAll()).toEqual([]);
      expect(await open()).toEqual([]);
    },
    T,
  );
});
