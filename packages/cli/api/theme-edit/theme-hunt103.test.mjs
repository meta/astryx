// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Names, flags and saved entries the editor reads as meant, and the
 * refusals that name a command which works: the theme typed after the
 * setting, `only` written as text, several bad `new` flags in one line,
 * show's and new's unknown options, reserved names, corners in rem, dial
 * words in capitals, a thing and value in one word, a missing theme name,
 * and the compile line from a subfolder. Every suggestion is followed.
 *
 * @position api/theme-edit — tests
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew} from './theme-edit.mjs';
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
const ED = ['experimental', 'theme', 'editor'];

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-names-flags-', FIXTURE_PACKAGES);
  await themeEditNew('t', {cwd});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/**
 * Run the CLI with --json; the envelope it prints.
 * @param {string[]} args
 * @param {string} [at]
 * @returns {any}
 */
const cli = (args, at = cwd) => {
  const r = spawnSync(process.execPath, [BIN, ...args, '--json'], {
    cwd: at,
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
 * Change the theme's settings file by hand.
 * @param {string} t
 * @param {(s: any[]) => void} fn
 */
const edit = (t, fn) => {
  const data = JSON.parse(fs.readFileSync(file(t), 'utf8'));
  fn(data.settings);
  fs.writeFileSync(file(t), JSON.stringify(data, null, 2));
};

describe('a missing theme name in an app with one theme', () => {
  it(
    'show and undo name that theme, and show of it works',
    () => {
      const show = cli([...ED, 'show']);
      expect(show.suggestions[0].name).toMatch(/ editor show t$/);
      expect(follow(show.suggestions[0].name).error).toBeUndefined();
      const undo = cli([...ED, 'undo']);
      expect(undo.suggestions[0].name).toMatch(/ editor undo t$/);
      expect(
        undo.suggestions.some((/** @type {any} */ x) => /</.test(x.name)),
      ).toBe(false);
    },
    T,
  );
});

describe('the theme typed after the setting', () => {
  it(
    'set names the set with the theme first, never a new theme, and it works',
    () => {
      const r = cli([...ED, 'set', '--color-accent', '#123457', 't']);
      expect(r.suggestions[0].name).toMatch(
        / editor set t --color-accent '#123457'$/,
      );
      expect(
        r.suggestions.some((/** @type {any} */ x) => / new /.test(x.name)),
      ).toBe(false);
      expect(follow(r.suggestions[0].name).error).toBeUndefined();
      expect(settings('t')).toContainEqual(
        expect.objectContaining({thing: '--color-accent', value: '#123457'}),
      );
      expect(fs.existsSync(path.join(cwd, 'themes', 'color-accent'))).toBe(
        false,
      );
    },
    T,
  );

  it(
    'undo names the undo with the theme first, and it works',
    () => {
      const r = cli([...ED, 'undo', '--color-accent', 't']);
      expect(r.suggestions[0].name).toMatch(/ editor undo t --color-accent$/);
      expect(follow(r.suggestions[0].name).error).toBeUndefined();
      expect(settings('t')).not.toContainEqual(
        expect.objectContaining({thing: '--color-accent'}),
      );
    },
    T,
  );
});

describe('only written by hand', () => {
  it(
    '"false" and "true" as text are read as what they say, noted, and saved as such',
    () => {
      expect(
        cli([
          ...ED,
          'set',
          't',
          'border',
          '1px solid red',
          '--on',
          'text-input',
        ]).error,
      ).toBeUndefined();
      edit('t', s => {
        s.find(x => x.thing === 'border').only = 'false';
      });
      const r = cli([...ED, 'set', 't', 'spacing', 'roomy']);
      expect(r.error).toBeUndefined();
      expect(r.data.notes).toContain(
        'border was saved with only "false", read as false',
      );
      expect(
        settings('t').find((/** @type {any} */ x) => x.thing === 'border'),
      ).not.toHaveProperty('only');
      edit('t', s => {
        s.find(x => x.thing === 'border').only = 'TRUE';
      });
      expect(
        cli([...ED, 'set', 't', 'spacing', 'compact']).error,
      ).toBeUndefined();
      expect(
        settings('t').find((/** @type {any} */ x) => x.thing === 'border').only,
      ).toBe(true);
    },
    T,
  );

  it(
    'any other value is refused, nothing written, with the undo of that entry, which works',
    () => {
      edit('t', s => {
        s.find(x => x.thing === 'border').only = 'no';
      });
      const before = fs.readFileSync(file('t'), 'utf8');
      const r = cli([...ED, 'set', 't', 'spacing', 'roomy']);
      expect(r.error).toContain('border has only "no", not true or false');
      expect(fs.readFileSync(file('t'), 'utf8')).toBe(before);
      expect(r.suggestions[0].name).toMatch(
        / editor undo t border --on text-input$/,
      );
      expect(follow(r.suggestions[0].name).error).toBeUndefined();
      expect(settings('t')).not.toContainEqual(
        expect.objectContaining({thing: 'border'}),
      );
      expect(settings('t')).toContainEqual(
        expect.objectContaining({thing: 'spacing'}),
      );
    },
    T,
  );
});

describe('undo of vibrancy', () => {
  it(
    'says the default vibrancy applies now',
    () => {
      cli([...ED, 'set', 't', 'accent', '#7c3aed']);
      cli([...ED, 'set', 't', 'vibrancy', '80']);
      const r = cli([...ED, 'undo', 't', 'vibrancy']);
      expect(r.data.now).toBe('the default vibrancy, 50');
    },
    T,
  );
});

describe('new with several bad dial flags', () => {
  it(
    'leads with one new that fixes or drops every bad flag, and it works',
    () => {
      const r = cli([
        ...ED,
        'new',
        'b8',
        '--accent',
        '#zzz',
        '--corners',
        'pil',
        '--spacing',
        'roomie',
      ]);
      const line = r.suggestions[0].name;
      expect(line).toMatch(/ editor new b8 /);
      expect(line).toContain('--corners pill');
      expect(line).toContain('--spacing roomy');
      expect(line).not.toContain('#zzz');
      expect(follow(line).error).toBeUndefined();
      expect(settings('b8')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({thing: 'corners', value: 'pill'}),
          expect.objectContaining({thing: 'spacing', value: 'roomy'}),
        ]),
      );
    },
    T,
  );

  it(
    '--base is read as --like, with the other flags kept',
    () => {
      const r = cli([
        ...ED,
        'new',
        'b9',
        '--base',
        'none',
        '--corners',
        'round',
      ]);
      expect(r.error).toContain('--like');
      expect(r.suggestions[0].name).toMatch(
        / editor new b9 --like none --corners round$/,
      );
      expect(follow(r.suggestions[0].name).error).toBeUndefined();
      expect(settings('b9')).toContainEqual(
        expect.objectContaining({thing: 'corners', value: 'round'}),
      );
    },
    T,
  );
});

describe('show with an option it does not take', () => {
  it(
    'names a show that works, the nearest option, and its help',
    () => {
      for (const flag of ['--foo', '--png=false', '--secton']) {
        const r = cli([...ED, 'show', 't', flag]);
        expect(r.code, flag).toBe('ERR_INVALID_OPTION');
        expect(r.suggestions[0].name, flag).toMatch(/ editor show t$/);
        expect(r.suggestions[1].name).toMatch(/ editor show --help$/);
      }
      expect(cli([...ED, 'show', 't', '--secton']).error).toContain(
        'did you mean --section?',
      );
      expect(
        cli([...ED, 'show', 't', '--png=true']).suggestions[0].name,
      ).toMatch(/ editor show t --png$/);
      expect(
        follow(cli([...ED, 'show', 't', '--foo']).suggestions[0].name).error,
      ).toBeUndefined();
    },
    T,
  );
});

describe('reserved names', () => {
  it(
    'com0 and lpt0 are refused by a rule that lists them',
    () => {
      for (const n of ['com0', 'lpt0']) {
        const r = cli([...ED, 'new', n]);
        expect(r.error, n).toContain('com0-com9, lpt0-lpt9');
      }
    },
    T,
  );
});

describe('corners', () => {
  it(
    'a rem is read as px and said so',
    () => {
      const r = cli([...ED, 'set', 't', 'corners', '0.375rem']);
      expect(r.error).toBeUndefined();
      expect(r.data.notes).toContain('corners 0.375rem is saved as 6px');
      expect(settings('t')).toContainEqual(
        expect.objectContaining({thing: 'corners', value: '6px'}),
      );
      expect(
        settings('t').find((/** @type {any} */ x) => x.thing === 'corners'),
      ).not.toHaveProperty('note');
    },
    T,
  );

  it(
    'a bare number is refused with the px line, which works',
    () => {
      const r = cli([...ED, 'set', 't', 'corners', '10']);
      expect(r.suggestions[0].name).toMatch(/ editor set t corners 10px$/);
      expect(follow(r.suggestions[0].name).error).toBeUndefined();
    },
    T,
  );
});

describe('dial words in any case', () => {
  it(
    'every dial takes its words in capitals',
    () => {
      for (const [thing, typed, saved] of [
        ['spacing', 'ROOMY', 'roomy'],
        ['buttons', 'SOLID', 'solid'],
        ['headings', 'BOLD', 'bold'],
        ['mode', 'BOTH', 'both'],
      ]) {
        const r = cli([...ED, 'set', 't', thing, typed]);
        expect(r.error, typed).toBeUndefined();
        expect(r.data.setting.value, typed).toBe(saved);
      }
    },
    T,
  );
});

describe('a thing and its value in one word', () => {
  it(
    'is read as the two, flags kept',
    () => {
      expect(cli([...ED, 'set', 't', 'corners pill']).data.setting).toEqual(
        expect.objectContaining({thing: 'corners', value: 'pill'}),
      );
      expect(
        cli([...ED, 'set', 't', 'background-color red', '--on', 'card']).data
          .setting,
      ).toEqual(
        expect.objectContaining({
          thing: 'background-color',
          value: 'red',
          on: 'card',
        }),
      );
    },
    T,
  );
});

describe('the compile line from a subfolder', () => {
  it(
    'runs from the folder the command ran in',
    () => {
      const sub = path.join(cwd, 'src', 'app');
      fs.mkdirSync(sub, {recursive: true});
      const r = cli([...ED, 'show', 't'], sub);
      const text = JSON.stringify(r.data.wiring);
      const m =
        /by hand, (cd [^&]+ && )?\S+ (experimental theme compile \S+)/.exec(
          text,
        );
      expect(m?.[1]).toBe('cd ../.. && ');
      const run = spawnSync(
        'sh',
        [
          '-c',
          `${m?.[1] ?? ''}"${process.execPath}" "${BIN}" ${m?.[2]} --check`,
        ],
        {cwd: sub, encoding: 'utf8'},
      );
      expect(run.status, run.stderr).toBe(0);
    },
    T,
  );
});
