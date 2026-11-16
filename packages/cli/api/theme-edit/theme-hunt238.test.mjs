// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A mode word typed with a typo that keeps its letters (`drak`,
 * `darkk`, `ligth`) is that mode wherever a person types one, by one
 * reader (modeNear): a label in a `how` question or a `set` value and the
 * `--mode` flag; a saved entry's typo keeps its repair line. A word of its
 * own (right, tight, bark) is never a mode.
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
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
import {modeNear} from './_normal.mjs';
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

// The renders are stood in for: these tests are about the settings written.
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

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt238-', FIXTURE_PACKAGES);
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

/** The writing commands a how answer gives. @param {string} ask */
const howWrites = async ask => {
  const {data} = /** @type {any} */ (
    await themeEditHow(ask, {cwd, theme: 't'})
  );
  return /** @type {Array<{commands: string[]}>} */ (data.results ?? [])
    .flatMap(r => r.commands)
    .flatMap(c => c.split(/ && /))
    .filter(c => / editor (set|undo) /.test(c));
};

describe('the one mode reader', () => {
  it('reads a typo that keeps the letters, and never a word of its own', () => {
    for (const [typed, mode] of /** @type {const} */ ([
      ['drak', 'dark'],
      ['darkk', 'dark'],
      ['Drak', 'dark'],
      ['drak mode', 'dark'],
      ['ligth', 'light'],
      ['lght', 'light'],
      ['dark', 'dark'],
      ['night', 'dark'],
    ]))
      expect(modeNear(typed), typed).toBe(mode);
    for (const word of ['right', 'tight', 'bark', 'park', 'dar', 'lite'])
      expect(modeNear(word), word).toBeNull();
  });
});

describe('a mode label typed with a typo', () => {
  for (const [label, mode] of [
    ['drak', 'dark'],
    ['darkk', 'dark'],
  ])
    it(
      `how "${label}: cards #1c1c1e" writes the card fill for ${mode} only`,
      async () => {
        const lines = await howWrites(`${label}: cards #1c1c1e`);
        expect(lines.length).toBeGreaterThan(0);
        for (const line of lines) expect(line).toContain(`--mode ${mode}`);
        for (const line of lines)
          expect((await follow(line)).error).toBeUndefined();
        expect(
          settings().every((/** @type {any} */ s) => s.mode === mode),
        ).toBe(true);
      },
      T,
    );

  it(
    'how "ligth: buttons red" writes for light only',
    async () => {
      const lines = await howWrites('ligth: buttons red');
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) expect(line).toContain('--mode light');
    },
    T,
  );

  it(
    "set background-color 'drak: #eeeeee' --on card offers the --mode dark line, and it runs",
    async () => {
      const r = await cli([
        ...ED,
        'set',
        't',
        'background-color',
        'drak: #eeeeee',
        '--on',
        'card',
      ]);
      expect(r.error).toBeDefined();
      const line = names(r).find((/** @type {string} */ n) =>
        / --mode dark\b/.test(n),
      );
      expect(line).toMatch(
        /set t background-color '#eeeeee' --on card --mode dark$/,
      );
      expect((await follow(line)).error).toBeUndefined();
      expect(settings()).toEqual([
        expect.objectContaining({
          thing: 'background-color',
          value: '#eeeeee',
          on: 'card',
          mode: 'dark',
        }),
      ]);
    },
    T,
  );

  it(
    'set … --mode drak offers the --mode dark line',
    async () => {
      const r = await cli([
        ...ED,
        'set',
        't',
        'background-color',
        '#eeeeee',
        '--on',
        'card',
        '--mode',
        'drak',
      ]);
      expect(names(r)[0]).toMatch(/ --on card --mode dark$/);
      expect((await follow(names(r)[0])).error).toBeUndefined();
    },
    T,
  );

  it(
    'a saved entry whose mode is "drak" offers its repair with --mode dark, as before',
    async () => {
      const d = JSON.parse(fresh);
      d.settings = [
        {
          thing: 'background-color',
          value: '#eeeeee',
          source: 'property',
          on: 'card',
          mode: 'drak',
        },
      ];
      fs.writeFileSync(file(), JSON.stringify(d, null, 2));
      const r = await cli([...ED, 'show', 't']);
      expect(r.error).toBeDefined();
      expect(names(r)).toContainEqual(
        expect.stringMatching(
          /set t background-color '#eeeeee' --on card --mode dark$/,
        ),
      );
    },
    T,
  );
});
