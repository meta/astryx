// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Hand-damaged settings entries and theme names typed as paths: an
 * entry mode or source in other words is read as meant and saved that way;
 * one that means nothing is refused with the undo that removes only that
 * entry; and the "same command with the theme's name" suggestion for set,
 * undo and compile is checked by that command first. Every suggestion is
 * followed, and the other settings are kept.
 *
 * @position api/theme-edit — tests
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {splitCommand} from './_vet.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';

const BIN = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../clients/cli/bin/astryx.mjs',
);
const T = 240_000;

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt93-', FIXTURE_PACKAGES);
  for (const t of ['m', 's', 't']) {
    await themeEditNew(t, {cwd});
    await themeEditSet(t, 'accent', 'red', {cwd});
    await themeEditSet(t, 'padding', '20px', {cwd, on: 'card'});
  }
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/**
 * Run the CLI with --json; the envelope it prints.
 * @param {string[]} args
 * @returns {any}
 */
const cli = args => {
  const r = spawnSync(process.execPath, [BIN, ...args, '--json'], {
    cwd,
    encoding: 'utf8',
  });
  return JSON.parse(r.stdout);
};

/**
 * Run a suggested command as printed (from `experimental` on).
 * @param {string} line
 */
const follow = line => {
  const args = splitCommand(line.slice(line.indexOf('experimental ')));
  if (!args) throw new Error(`cannot read ${line}`);
  return cli(args);
};

/** @param {string} t */
const file = t => path.join(cwd, 'themes', t, `${t}.settings.json`);
/** @param {string} t */
const settings = t => JSON.parse(fs.readFileSync(file(t), 'utf8')).settings;
/**
 * Add entries to the theme's settings file by hand.
 * @param {string} t
 * @param {object[]} entries
 */
const add = (t, ...entries) => {
  const data = JSON.parse(fs.readFileSync(file(t), 'utf8'));
  data.settings.push(...entries);
  fs.writeFileSync(file(t), JSON.stringify(data, null, 2));
};
/** @param {string} t */
const kept = t => {
  const s = settings(t);
  expect(s).toContainEqual(expect.objectContaining({thing: 'accent'}));
  expect(s).toContainEqual(
    expect.objectContaining({thing: 'padding', on: 'card'}),
  );
};
/** @param {string} t */
const drop = t => {
  const data = JSON.parse(fs.readFileSync(file(t), 'utf8'));
  data.settings = data.settings.filter(
    (/** @type {any} */ x) => x.thing === 'accent' || x.thing === 'padding',
  );
  fs.writeFileSync(file(t), JSON.stringify(data, null, 2));
};

describe('an entry mode written in other words', () => {
  it(
    'Dark, night, dark-mode, Light, day and Light-Mode are read as dark or light, said in a note, and saved that way by the next change',
    () => {
      for (const [typed, read] of [
        ['Dark', 'dark'],
        ['night', 'dark'],
        ['Light', 'light'],
        ['day', 'light'],
        ['dark-mode', 'dark'],
        ['Light-Mode', 'light'],
      ]) {
        drop('m');
        add('m', {
          source: 'token',
          thing: '--color-accent',
          value: '#224466',
          mode: typed,
        });
        const r = cli([
          'experimental',
          'theme',
          'editor',
          'set',
          'm',
          'corners',
          'more',
        ]);
        expect(r.error, typed).toBeUndefined();
        expect(r.data.notes, typed).toContain(
          `--color-accent was saved with mode "${typed}", read as ${read}`,
        );
        expect(settings('m'), typed).toContainEqual(
          expect.objectContaining({thing: '--color-accent', mode: read}),
        );
        kept('m');
      }
    },
    T,
  );

  it(
    'an undo by the mode it is read as removes only that entry',
    () => {
      drop('m');
      add(
        'm',
        {source: 'token', thing: '--color-accent', value: '#111111'},
        {
          source: 'token',
          thing: '--color-accent',
          value: '#224466',
          mode: 'Dark',
        },
      );
      const r = cli([
        'experimental',
        'theme',
        'editor',
        'undo',
        'm',
        '--color-accent',
        '--mode',
        'dark',
      ]);
      expect(r.error).toBeUndefined();
      const left = settings('m').filter(
        (/** @type {any} */ x) => x.thing === '--color-accent',
      );
      expect(left).toHaveLength(1);
      expect(left[0].value).toBe('#111111');
      expect(left[0].mode).toBeUndefined();
      kept('m');
    },
    T,
  );

  it(
    'a mode that means nothing is refused with the undo of that entry first, and the step back second',
    () => {
      drop('m');
      add(
        'm',
        {source: 'token', thing: '--color-accent', value: '#111111'},
        {
          source: 'token',
          thing: '--color-accent',
          value: '#224466',
          mode: 'purple',
        },
      );
      const r = cli([
        'experimental',
        'theme',
        'editor',
        'set',
        'm',
        'corners',
        'more',
      ]);
      expect(r.error).toContain('--color-accent has mode "purple"');
      expect(r.suggestions[0].name).toMatch(/ editor undo m --color-accent$/);
      expect(r.suggestions[1].name).toMatch(/ editor undo m$/);
      expect(r.suggestions[1].reason).toContain('the last change is then lost');
      expect(follow(r.suggestions[0].name).error).toBeUndefined();
      const left = settings('m').filter(
        (/** @type {any} */ x) => x.thing === '--color-accent',
      );
      expect(left).toEqual([expect.objectContaining({value: '#111111'})]);
      kept('m');
      // The command refused before runs now.
      expect(
        cli(['experimental', 'theme', 'editor', 'set', 'm', 'corners', 'more'])
          .error,
      ).toBeUndefined();
    },
    T,
  );
});

describe('an entry source written in other letters, or missing', () => {
  it(
    'Dial in any case is read as dial, and a missing source follows from the thing; each is noted and saved',
    () => {
      drop('s');
      add(
        's',
        {source: 'DIAL', thing: 'spacing', value: 'roomy'},
        {thing: 'type', value: 'compact'},
        {thing: '--color-accent', value: '#224466'},
        {thing: 'margin', value: '4px', on: 'card'},
      );
      const r = cli([
        'experimental',
        'theme',
        'editor',
        'set',
        's',
        'corners',
        'more',
      ]);
      expect(r.error).toBeUndefined();
      expect(r.data.notes).toEqual(
        expect.arrayContaining([
          'spacing was saved with source "DIAL", read as dial',
          'type was saved with no source, read as dial',
          '--color-accent was saved with no source, read as token',
          'margin was saved with no source, read as property',
        ]),
      );
      const s = settings('s');
      for (const [thing, source] of [
        ['spacing', 'dial'],
        ['type', 'dial'],
        ['--color-accent', 'token'],
        ['margin', 'property'],
      ])
        expect(s, thing).toContainEqual(
          expect.objectContaining({thing, source}),
        );
      kept('s');
    },
    T,
  );

  it(
    'a source that means nothing is named as such and refused with the undo of that entry, which works',
    () => {
      drop('s');
      add('s', {source: 'banana', thing: '--color-accent', value: '#224466'});
      const r = cli([
        'experimental',
        'theme',
        'editor',
        'set',
        's',
        'corners',
        'more',
      ]);
      expect(r.error).toContain(
        '--color-accent has source "banana", not dial, token or property',
      );
      expect(r.error).not.toContain('has no source');
      expect(r.suggestions[0].name).toMatch(/ editor undo s --color-accent$/);
      expect(follow(r.suggestions[0].name).error).toBeUndefined();
      expect(settings('s')).not.toContainEqual(
        expect.objectContaining({thing: '--color-accent'}),
      );
      kept('s');
    },
    T,
  );
});

describe('a theme name typed as a path', () => {
  it(
    'set leads with one line that carries every repair, and that line works',
    () => {
      const r = cli([
        'experimental',
        'theme',
        'editor',
        'set',
        'themes/t',
        'border',
        '1.5',
        '--on',
        'cards',
      ]);
      expect(r.suggestions[0].name).toMatch(
        / editor set t border 1\.5px --on card$/,
      );
      expect(follow(r.suggestions[0].name).error).toBeUndefined();
      expect(settings('t')).toContainEqual(
        expect.objectContaining({thing: 'border', value: '1.5px', on: 'card'}),
      );
      kept('t');
    },
    T,
  );

  it(
    'undo leads with one line that carries every repair, and that line works',
    () => {
      const r = cli([
        'experimental',
        'theme',
        'editor',
        'undo',
        'themes/t',
        'border',
        '--on',
        'cards',
      ]);
      expect(r.suggestions[0].name).toMatch(/ editor undo t border --on card$/);
      expect(follow(r.suggestions[0].name).error).toBeUndefined();
      expect(settings('t')).not.toContainEqual(
        expect.objectContaining({thing: 'border'}),
      );
      kept('t');
    },
    T,
  );

  it(
    'undo of the padding by a path and a plural part leads with the undo that works',
    () => {
      const r = cli([
        'experimental',
        'theme',
        'editor',
        'undo',
        'themes/t',
        'padding',
        '--on',
        'cards',
      ]);
      expect(r.suggestions[0].name).toMatch(
        / editor undo t padding --on card$/,
      );
      expect(follow(r.suggestions[0].name).error).toBeUndefined();
      expect(settings('t')).not.toContainEqual(
        expect.objectContaining({thing: 'padding'}),
      );
      expect(settings('t')).toContainEqual(
        expect.objectContaining({thing: 'accent'}),
      );
      expect(
        cli([
          'experimental',
          'theme',
          'editor',
          'set',
          't',
          'padding',
          '20px',
          '--on',
          'card',
        ]).error,
      ).toBeUndefined();
    },
    T,
  );

  it(
    'when the rest cannot be repaired, the reason says so',
    () => {
      const r = cli([
        'experimental',
        'theme',
        'editor',
        'undo',
        './t',
        'margin',
        '--on',
        'cards',
      ]);
      expect(r.suggestions[0].name).toMatch(/ editor undo t margin --on card$/);
      expect(r.suggestions[0].reason).toContain('still needs a fix');
      expect(r.suggestions[0].reason).toContain(
        't does not set margin on card',
      );
    },
    T,
  );

  it(
    'compile of the app copy with --out in it leads with the compile of the theme itself, which works',
    () => {
      const r = cli([
        'experimental',
        'theme',
        'compile',
        'src/themes/t/tTheme.ts',
        '--check',
        '--out',
        'src/themes/t',
      ]);
      expect(r.suggestions[0].name).toMatch(
        / experimental theme compile themes\/t\/t\.theme\.ts --check$/,
      );
      expect(follow(r.suggestions[0].name).error).toBeUndefined();
      kept('t');
    },
    T,
  );

  it(
    'compile of the theme folder with --out outside the working folder leads with the theme source and no --out, saying why',
    () => {
      const outside = path.join(path.dirname(cwd), 'elsewhere', 't.css');
      const r = cli([
        'experimental',
        'theme',
        'compile',
        'themes/t',
        '--out',
        outside,
      ]);
      expect(r.suggestions[0].name).toMatch(
        / experimental theme compile themes\/t\/t\.theme\.ts$/,
      );
      expect(r.suggestions[0].reason).toContain('without --out');
      expect(r.suggestions[0].reason).toContain('outside the working folder');
      expect(follow(r.suggestions[0].name).error).toBeUndefined();
      expect(fs.existsSync(outside)).toBe(false);
      kept('t');
    },
    T,
  );

  it(
    'a quoted --icons-specifier stays intact through the repairs',
    () => {
      const r = cli([
        'experimental',
        'theme',
        'compile',
        'themes/t',
        '--check',
        '--icons-specifier',
        "./my icons's.mjs",
      ]);
      expect(r.suggestions[0].name).toMatch(
        / compile themes\/t\/t\.theme\.ts --icons-specifier '\.\/my icons'\\''s\.mjs' --check$/,
      );
      const args = splitCommand(
        r.suggestions[0].name.slice(
          r.suggestions[0].name.indexOf('experimental '),
        ),
      );
      expect(args).toContain("./my icons's.mjs");
    },
    T,
  );
});
