// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The settings file read as typed input is: a saved scope that is not
 * text is damage with an undo that removes it (never a crash), a set of a
 * headings half replaces a headings entry whose axis names no half, a saved
 * base `None` is no base, top-level field names in other letters are those
 * fields, and a pasted entry's field spelled as its flag (`"--on"`) or a
 * change line with the `→` arrow or a label before its colon is read.
 * Every offered line is followed.
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
import {runCli} from '../../test-utils/run-cli.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

// The assertions are about settings, builds, notes and lines, not rendered
// pages: a render costs seconds, so the pages are written by the stand-in.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

const T = 240_000;
const ED = ['experimental', 'theme', 'editor'];
/** @type {string} */
let cwd;
/** @type {string} */
let fresh;
const file = () => path.join(cwd, 'themes/t/t.settings.json');
beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-file-input-saved-scope-',
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
  fs.rmSync(path.join(cwd, 'themes/t/.history.json'), {force: true});
});

/** @returns {any} */
const saved = () => JSON.parse(fs.readFileSync(file(), 'utf8'));
/** @param {(d: any) => void} edit */
const editFile = edit => {
  const d = saved();
  edit(d);
  fs.writeFileSync(file(), `${JSON.stringify(d, null, 2)}\n`);
};

/**
 * An editor command with --json: its exit status and its result.
 * @param {string[]} args
 */
async function cli(args) {
  const r = await runCli([...ED, ...args, '--json'], {cwd});
  const text = [r.stdout, r.stderr].find(x => x.trim().startsWith('{')) ?? '{}';
  return {status: r.status, json: JSON.parse(text)};
}

/** The words of an offered line after the editor's name. @param {string} line */
const wordsOf = line => {
  const w = splitCommand(line);
  return w.slice(w.indexOf('editor') + 1);
};

/** The offered lines, as words after the editor's name. @param {any} json */
const offered = json =>
  (json.suggestions ?? []).map((/** @type {any} */ s) => wordsOf(s.name));

const BUTTON = {
  thing: 'background-color',
  value: 'red',
  source: 'property',
  on: 'button',
};

describe('a saved scope that is not text', () => {
  it(
    'is refused with an undo that removes it, and no command crashes',
    async () => {
      for (const [scope, line] of /** @type {const} */ ([
        [{when: 5}, ['undo', 't', 'background-color', '--on', 'button']],
        [{when: true}, ['undo', 't', 'background-color', '--on', 'button']],
        [{on: 5}, ['undo', 't', 'background-color', '--on', '']],
      ])) {
        fs.writeFileSync(file(), fresh);
        editFile(d => {
          d.settings = [{...BUTTON, ...scope}];
        });
        for (const args of [
          ['show', 't'],
          ['set', 't', 'accent', 'blue'],
        ]) {
          const r = await cli(args);
          expect(r.json.code).toBe('ERR_THEME_INVALID');
          expect(offered(r.json)[0]).toEqual(line);
        }
        const done = await cli([...line]);
        expect(done.status).toBe(0);
        expect(saved().settings).toEqual([]);
      }
    },
    T,
  );

  it(
    'that is an object, a list, a number or no part: its undo line removes it',
    async () => {
      for (const scope of [
        {when: {}},
        {when: []},
        {state: {}},
        {state: 5},
        {state: true},
        {on: {}},
        {on: ''},
      ]) {
        fs.writeFileSync(file(), fresh);
        editFile(d => {
          d.settings = [{...BUTTON, ...scope}];
        });
        const r = await cli(['show', 't']);
        expect(r.json.code).toBe('ERR_THEME_INVALID');
        const [undo] = offered(r.json);
        expect(undo.slice(0, 3)).toEqual(['undo', 't', 'background-color']);
        const done = await cli(undo);
        expect(done.status).toBe(0);
        expect(saved().settings).toEqual([]);
        expect((await cli(['show', 't'])).status).toBe(0);
      }
    },
    T,
  );
});

describe('a headings entry whose axis names no half', () => {
  it(
    'is replaced by a set of headings, so the next command works',
    async () => {
      for (const value of ['bold', 'tight']) {
        fs.writeFileSync(file(), fresh);
        editFile(d => {
          d.settings = [
            {thing: 'headings', value: 'bold', source: 'dial', axis: 'size'},
          ];
        });
        const r = await cli(['show', 't']);
        expect(r.json.code).toBe('ERR_THEME_INVALID');
        // Every line offered, followed on its own.
        for (const line of offered(r.json)) {
          if (line[0] !== 'set') continue;
          expect((await cli(line)).status).toBe(0);
          fs.writeFileSync(file(), fresh);
          editFile(d => {
            d.settings = [
              {thing: 'headings', value: 'bold', source: 'dial', axis: 'size'},
            ];
          });
        }
        expect((await cli(['set', 't', 'headings', value])).status).toBe(0);
        expect(
          saved().settings.filter(
            (/** @type {any} */ s) => s.thing === 'headings',
          ),
        ).toHaveLength(1);
        expect((await cli(['set', 't', 'accent', 'red'])).status).toBe(0);
      }
    },
    T,
  );
});

describe('a saved base written None', () => {
  it(
    'is no base, in any letters',
    async () => {
      expect((await cli(['set', 't', 'base', 'none'])).status).toBe(0);
      const none = fs.readFileSync(file(), 'utf8');
      for (const like of ['None', 'NONE', ' none']) {
        fs.writeFileSync(file(), none);
        editFile(d => {
          d.like = like;
        });
        const r = await cli(['show', 't']);
        expect(r.status).toBe(0);
        expect(JSON.stringify(r.json)).not.toMatch(/set t base neutral/);
        expect((await cli(['set', 't', 'accent', 'red'])).status).toBe(0);
        expect(saved().like).toBeUndefined();
      }
    },
    T,
  );
});

describe('top-level field names in other letters', () => {
  it(
    'are those fields',
    async () => {
      editFile(d => {
        d.Settings = [
          {thing: 'corners', value: 'pill', source: 'dial'},
          {thing: 'accent', value: 'red', source: 'dial'},
        ];
        delete d.settings;
        d.Mode = d.mode;
        delete d.mode;
      });
      expect((await cli(['show', 't'])).status).toBe(0);
      expect((await cli(['set', 't', 'spacing', 'roomy'])).status).toBe(0);
      const d = saved();
      expect(d.Settings).toBeUndefined();
      expect(d.settings.map((/** @type {any} */ s) => s.thing)).toEqual([
        'corners',
        'accent',
        'spacing',
      ]);
      expect(d.mode).toBe('both');
      // A base under `Like` is that base, never no base.
      expect((await cli(['set', 't', 'base', 'none'])).status).toBe(0);
      editFile(x => {
        x.Like = 'neutral';
      });
      expect((await cli(['set', 't', 'accent', 'blue'])).status).toBe(0);
      expect(saved().like).toBe('neutral');
      expect(saved().Like).toBeUndefined();
    },
    T,
  );
});

describe('a pasted entry with a field spelled as its flag', () => {
  it(
    'reads "--on" as the part',
    async () => {
      const r = await cli([
        'set',
        't',
        '{"thing":"background-color","value":"red","--on":"card"}',
      ]);
      expect(offered(r.json)).toContainEqual([
        'set',
        't',
        'background-color',
        'red',
        '--on',
        'card',
      ]);
      for (const line of offered(r.json))
        if (line[0] === 'set') expect((await cli(line)).status).toBe(0);
    },
    T,
  );
});

describe('a pasted change line with the arrow or a label before its colon', () => {
  it(
    'is read with its mode',
    async () => {
      for (const line of [
        '--color-accent (Dark) \u2192 #7c3aed',
        '--color-accent [dark only] \u2192 #7c3aed',
        '--color-accent (dark mode): #7c3aed',
      ]) {
        fs.writeFileSync(file(), fresh);
        expect((await cli(['set', 't', line])).status).toBe(0);
        const entry = saved().settings.find(
          (/** @type {any} */ s) => s.thing === '--color-accent',
        );
        expect(entry?.mode).toBe('dark');
        expect(entry?.value).toBe('#7c3aed');
      }
    },
    T,
  );
});

describe('a pasted change line with a label, its colon and no old value', () => {
  it(
    'is saved for that mode only',
    async () => {
      for (const line of [
        '--color-accent (dark): -> red',
        '--color-accent [dark only]: -> red',
        '--color-accent (dark):-> red',
      ]) {
        fs.writeFileSync(file(), fresh);
        expect((await cli(['set', 't', line])).status).toBe(0);
        const entry = saved().settings.find(
          (/** @type {any} */ s) => s.thing === '--color-accent',
        );
        expect(entry?.mode).toBe('dark');
      }
    },
    T,
  );
});

describe('an empty pasted object', () => {
  it(
    'points to the dials and set help, each of which runs',
    async () => {
      const r = await cli(['set', 't', '{}']);
      expect(r.json.code).toBe('ERR_MISSING_ARGUMENT');
      const lines = offered(r.json);
      expect(lines).toEqual([
        ['how', '--list', 'dials'],
        ['set', '--help'],
      ]);
      expect((await runCli([...ED, ...lines[0]], {cwd})).status).toBe(0);
    },
    T,
  );
});

describe('an undo of a setting and its value in one argument', () => {
  it(
    'is read as set reads it',
    async () => {
      expect((await cli(['set', 't', 'accent', 'red'])).status).toBe(0);
      const other = await cli(['undo', 't', 'accent blue']);
      expect(other.status).not.toBe(0);
      expect(other.json.error).not.toMatch(/names 2 settings/);
      expect((await cli(['undo', 't', 'accent red'])).status).toBe(0);
      expect(saved().settings).toEqual([]);
    },
    T,
  );
});

describe('a swapped setting and value with the setting misspelled', () => {
  it(
    'gets the swap line, which runs',
    async () => {
      for (const [args, want] of /** @type {const} */ ([
        [
          ['pill', 'cornres'],
          ['set', 't', 'corners', 'pill'],
        ],
        [
          ['8px', 'paddng', '--on', 'card'],
          ['set', 't', 'padding', '8px', '--on', 'card'],
        ],
      ])) {
        fs.writeFileSync(file(), fresh);
        const r = await cli(['set', 't', ...args]);
        expect(offered(r.json)[0]).toEqual(want);
        expect((await cli([...want])).status).toBe(0);
      }
    },
    T,
  );
});

describe('a pasted change line whose label names a part', () => {
  it(
    'reads an exact part name as the part, and any other word as a mode',
    async () => {
      expect(
        (await cli(['set', 't', 'background-color (card) -> red'])).status,
      ).toBe(0);
      const entry = saved().settings.find(
        (/** @type {any} */ s) => s.thing === 'background-color',
      );
      expect(entry?.on).toBe('card');
      expect(entry?.mode).toBeUndefined();
      fs.writeFileSync(file(), fresh);
      const typo = await cli(['set', 't', '--color-accent (drak) -> red']);
      expect(typo.status).not.toBe(0);
      const line = offered(typo.json).find(
        (/** @type {string[]} */ l) => l[0] === 'set',
      );
      expect(line).toEqual([
        'set',
        't',
        '--color-accent',
        'red',
        '--mode',
        'dark',
      ]);
      expect((await cli(line)).status).toBe(0);
    },
    T,
  );
});
