// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The sixteenth pass over `astryx experimental theme editor`: every
 * suggestion a refusal gives runs, and does what it says.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt16-', FIXTURE_PACKAGES);
  await themeEditNew('t', {cwd});
  await themeEditSet('t', 'corners', 'pill', {cwd});
  await themeEditSet('t', 'spacing', 'roomy', {cwd});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

const settings = () =>
  JSON.parse(
    fs.readFileSync(path.join(cwd, 'themes/t/t.settings.json'), 'utf8'),
  ).settings.map((/** @type {any} */ x) => x.thing);

/** @param {() => Promise<unknown>} run */
async function refusal(run) {
  try {
    await run();
  } catch (error) {
    return /** @type {any} */ (error);
  }
  throw new Error('expected a refusal');
}

describe('undo of a named setting', () => {
  it('suggests the near setting, never a bare step back', async () => {
    const err = await refusal(() => themeEditUndo('t', {cwd, thing: 'corner'}));
    expect(err.suggestions.map((/** @type {any} */ x) => x.name)).toEqual([
      expect.stringMatching(/ undo t corners$/),
    ]);
    expect(settings()).toEqual(['corners', 'spacing']);
  }, 240_000);

  it('reads a setting name in any case', async () => {
    await themeEditUndo('t', {cwd, thing: 'Corners'});
    expect(settings()).toEqual(['spacing']);
    await themeEditSet('t', 'corners', 'pill', {cwd});
  }, 240_000);
});

describe('a hand-edited setting', () => {
  it('suggests a value to set only for a token whose value has the wrong type', async () => {
    const file = path.join(cwd, 'themes/t/t.settings.json');
    const before = fs.readFileSync(file, 'utf8');
    try {
      for (const entry of [
        {thing: '--not-a-token', value: '5px', source: 'token'},
        {thing: 'corners', value: 'pill', source: 'token'},
      ]) {
        const data = JSON.parse(before);
        data.settings = [entry];
        fs.writeFileSync(file, JSON.stringify(data));
        const err = await refusal(() => themeEditShow('t', {cwd}));
        expect(err.code).toBe('ERR_THEME_INVALID');
        expect(
          err.suggestions.filter((/** @type {any} */ x) =>
            / set t /.test(x.name),
          ),
        ).toEqual([]);
      }
    } finally {
      fs.writeFileSync(file, before);
    }
  }, 240_000);
});

describe('new', () => {
  it("suggests a free, valid name for a folder of the user's files", async () => {
    for (const dir of ['u', 'u-2']) {
      fs.mkdirSync(path.join(cwd, 'themes', dir), {recursive: true});
      fs.writeFileSync(path.join(cwd, 'themes', dir, 'mine.txt'), 'hi\n');
    }
    const err = await refusal(() => themeEditNew('u', {cwd}));
    expect(err.suggestions[0].name).toMatch(/ new u-3$/);

    const long = 'a'.repeat(64);
    fs.mkdirSync(path.join(cwd, 'themes', long), {recursive: true});
    fs.writeFileSync(path.join(cwd, 'themes', long, 'mine.txt'), 'hi\n');
    const longErr = await refusal(() => themeEditNew(long, {cwd}));
    const name = longErr.suggestions[0].name.split(' ').at(-1);
    expect(name).toBe(`${'a'.repeat(62)}-2`);
  }, 240_000);

  it('says what undo restores after damaged settings, and that the last change is not kept', async () => {
    const file = path.join(cwd, 'themes/t/t.settings.json');
    const before = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, 'x\n');
    const made = await themeEditNew('t', {cwd});
    expect(JSON.stringify(made)).toContain(
      'steps back to the settings from before the last change, and the last change itself is not kept',
    );
    fs.writeFileSync(file, before);
  }, 240_000);
});

describe('repeated flags', () => {
  it.each([
    [
      ['new', 'q', '--like', 'neutral', '--like', 't'],
      / new q --like neutral$/,
    ],
    [
      ['new', 'q', '--corners', 'small', '--corners', 'bogus'],
      / new q --corners small$/,
    ],
    [['new', 'q', '--like', 'x', '--like', 'y'], / new q$/],
    [
      ['show', 't', '--section', 'colors', '--section', 'actions'],
      / show t --section actions$/,
    ],
    // A bare word that is no color is not taken for one.
    [
      ['new', 'q', '--accent', 'banana', '--accent', 'red'],
      / new q --accent red$/,
    ],
  ])(
    'suggest the first value the flag takes: %j',
    async (args, expected) => {
      const r = await runCli(
        ['--json', 'experimental', 'theme', 'editor', ...args],
        cwd,
      );
      expect(r.status).toBe(1);
      expect(JSON.parse(r.stdout).suggestions[0].name).toMatch(expected);
    },
    120_000,
  );
});

describe('corrected new commands keep every option', () => {
  it.each([
    [
      ['new', 'Brand', '--like', 'neutral', '--accent', 'red'],
      / new brand --like neutral --accent red$/,
    ],
    [
      [
        'new',
        'brand',
        '--like',
        'Neutral',
        '--accent',
        '#e11d48',
        '--mode',
        'dark-only',
      ],
      / new brand --like neutral (--accent '#e11d48' --mode dark-only|--mode dark-only --accent '#e11d48')$/,
    ],
    [
      [
        'new',
        'y',
        '--like',
        'neutralx',
        '--accent',
        'red',
        '--mode',
        'dark-only',
      ],
      // The nearest base is guessed only among installed ones (none here).
      / new y (?!.*--like)/,
    ],
    [
      ['new', 'z', '--accent', '#ggg', '--mode', 'light-only', '--png'],
      / new z .*--accent '#7c3aed'.* --png$/,
    ],
  ])(
    '%j',
    async (args, expected) => {
      const r = await runCli(
        ['--json', 'experimental', 'theme', 'editor', ...args],
        cwd,
      );
      expect(r.status).toBe(1);
      const names = JSON.parse(r.stdout).suggestions.map(
        (/** @type {any} */ x) => x.name,
      );
      expect(
        names.some((/** @type {string} */ n) => expected.test(n)),
        names.join('\n'),
      ).toBe(true);
    },
    120_000,
  );
});

describe('a guessed base', () => {
  it('is the nearest installed base, and the corrected new keeps every option', async () => {
    const withBase = makeLinkedFixture(
      'astryx-theme-hunt16-base-',
      FIXTURE_PACKAGES,
    );
    try {
      writeFixtureBaseTheme(withBase, 'neutral');
      const r = await runCli(
        [
          '--json',
          'experimental',
          'theme',
          'editor',
          'new',
          'y',
          '--like',
          'neutralx',
          '--accent',
          'red',
          '--mode',
          'dark-only',
        ],
        withBase,
      );
      expect(r.status).toBe(1);
      const names = JSON.parse(r.stdout).suggestions.map(
        (/** @type {any} */ x) => x.name,
      );
      expect(
        names.some((/** @type {string} */ n) =>
          / new y --like neutral --accent red --mode dark-only$/.test(n),
        ),
        names.join('\n'),
      ).toBe(true);
    } finally {
      removeLinkedFixture(withBase);
    }
  }, 120_000);
});

describe('how changes by an amount from the theme it reads', () => {
  it('moves the theme corners from its own radius, not the base theme', async () => {
    await themeEditNew('rr', {cwd});
    await themeEditSet('rr', 'corners', '20px', {cwd});
    const {themeEditHow} = await import('./theme-edit.mjs');
    const up = await themeEditHow('make corners 2px rounder', {
      cwd,
      theme: 'rr',
    });
    expect(JSON.stringify(up.data)).toMatch(/from 20px to 22px/);
    const down = await themeEditHow('decrease the radius by 2px', {
      cwd,
      theme: 'rr',
    });
    expect(JSON.stringify(down.data)).toMatch(/from 20px to 18px/);
  }, 240_000);
});

describe('corrected new commands keep every option (r78e)', () => {
  it.each([
    [
      [
        'new',
        'h4',
        '--headings',
        'bold',
        '--headings',
        'heavy',
        '--headings',
        'medium',
        '--accent',
        'red',
      ],
      / new h4 --accent red --headings bold$/,
    ],
    [
      [
        'new',
        'h5',
        '--headings',
        'tight',
        '--headings',
        'BOLD',
        '--accent',
        'red',
      ],
      / new h5 --accent red --headings tight --headings bold$/,
    ],
    [
      ['new', 'q', '--like', 'banana', '--accent', 'red'],
      / new q --accent red$/,
    ],
    [
      ['new', 'neutral', '--like', 'none', '--accent', 'red'],
      / new my-neutral --like none --accent red$/,
    ],
    [
      [
        'new',
        'h3',
        '--headings',
        'bold',
        '--headings',
        'tight',
        '--headings',
        'heavy',
        '--accent',
        'red',
      ],
      / new h3 --accent red --headings bold --headings tight$/,
    ],
    [
      ['new', 'neutral', '--accent', 'red', '--png'],
      / new my-neutral --like neutral --accent red --png$/,
    ],
    [
      [
        'new',
        'hh',
        '--headings',
        'bold',
        '--headings',
        'heavy',
        '--accent',
        'red',
      ],
      // The first value stays (hunt16); the later one for the same axis goes.
      / new hh --accent red --headings bold$/,
    ],
  ])(
    '%j',
    async (args, expected) => {
      const r = await runCli(
        ['--json', 'experimental', 'theme', 'editor', ...args],
        cwd,
      );
      expect(r.status).toBe(1);
      const names = JSON.parse(r.stdout).suggestions.map(
        (/** @type {any} */ x) => x.name,
      );
      expect(
        names.some((/** @type {string} */ n) => expected.test(n)),
        names.join('\n'),
      ).toBe(true);
    },
    120_000,
  );
});
