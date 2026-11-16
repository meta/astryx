// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The settings file and token names read as typed: undo of a setting
 * listed twice by hand accepts any value it holds, removes every entry and
 * names each value removed; show notes a field written twice, as set does;
 * a token name whose word is a part the editor knows is never repaired by
 * spelling to another token. Every offered line is followed.
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

// The assertions are about settings, notes and lines, not rendered pages:
// a render costs seconds, so the pages are written by the stand-in.
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
    'astryx-theme-file-token-names-undo-',
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

const TWICE = [
  {thing: 'accent', value: 'red', source: 'dial'},
  {thing: 'accent', value: 'blue', source: 'dial'},
  {thing: 'corners', value: 'pill', source: 'dial'},
];

describe('an undo of a setting listed twice by hand', () => {
  it(
    'accepts either value, removes both, and names both',
    async () => {
      for (const value of [[], ['blue'], ['red']]) {
        fs.writeFileSync(file(), fresh);
        editFile(d => {
          d.settings = structuredClone(TWICE);
        });
        const r = await cli(['undo', 't', 'accent', ...value]);
        expect(r.status).toBe(0);
        expect(saved().settings).toEqual([TWICE[2]]);
        expect(
          r.json.data.alsoRemoved.map((/** @type {any} */ x) => x.value),
        ).toEqual(['red']);
        expect(r.json.data.removed.value).toBe('blue');
      }
      fs.writeFileSync(file(), fresh);
      editFile(d => {
        d.settings = structuredClone(TWICE);
      });
      const text = await runCli([...ED, 'undo', 't', 'accent'], {cwd});
      expect(text.stdout).toMatch(
        /removed accent = blue \(whole theme\) and "red" \(it was listed twice\)/,
      );
    },
    T,
  );

  it(
    'refuses a value it does not hold, naming the one the build reads',
    async () => {
      editFile(d => {
        d.settings = structuredClone(TWICE);
      });
      const r = await cli(['undo', 't', 'accent', 'green']);
      expect(r.status).not.toBe(0);
      expect(r.json.error).toMatch(/sets accent = blue/);
      const lines = offered(r.json);
      expect(lines[0]).toEqual(['undo', 't', 'accent']);
      expect((await cli(lines[0])).status).toBe(0);
      expect(saved().settings).toEqual([TWICE[2]]);
    },
    T,
  );
});

describe('a settings file that writes a field twice', () => {
  it(
    'is noted by show, as by set',
    async () => {
      editFile(d => {
        d.Like = 'stone';
      });
      const r = await cli(['show', 't']);
      expect(r.status).toBe(0);
      expect(r.json.data.notes.join('\n')).toMatch(
        /writes both "like" and "Like"/,
      );
    },
    T,
  );
});

describe('a token name whose word is a part the editor knows', () => {
  it(
    'is never repaired to a token one letter away by spelling',
    async () => {
      const r = await cli(['set', 't', '--color-text-link', 'blue']);
      expect(r.status).not.toBe(0);
      const lines = offered(r.json);
      expect(lines.flat()).not.toContain('--color-text-pink');
      for (const line of lines)
        expect((await runCli([...ED, ...line], {cwd})).status).toBe(0);
    },
    T,
  );
});
