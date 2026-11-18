// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Undo and paste forms read as typed: one argument with a setting and
 * its value (a typo of the setting, or one the theme does not hold), bare
 * words that are a held value, a setting's name where the theme goes,
 * several pasted lines, an empty pasted object, a label that is a part typo
 * or no mode; and a damaged entry beside a
 * clean one of the same scope. Every offered line is followed.
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
    'astryx-theme-undo-paste-forms-argument-',
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

/** Sets corners, accent and spacing, the last change spacing. */
async function threeSet() {
  for (const [k, v] of [
    ['corners', 'pill'],
    ['accent', 'red'],
    ['spacing', 'roomy'],
  ])
    expect((await cli(['set', 't', k, v])).status).toBe(0);
}

describe('an undo of a setting and its value in one argument', () => {
  it(
    'names the setting a typo means, and never steps back over another change',
    async () => {
      await threeSet();
      for (const [typed, want] of [
        ['cornres pill', ['undo', 't', 'corners']],
        ['acent red', ['undo', 't', 'accent']],
      ]) {
        const r = await cli(['undo', 't', typed]);
        const lines = offered(r.json);
        expect(lines).not.toContainEqual(['undo', 't']);
        expect(lines[0]).toEqual(want);
      }
      for (const typed of ['headings bold', '--color-accent red']) {
        const r = await cli(['undo', 't', typed]);
        expect(offered(r.json)).toEqual([['show', 't']]);
        expect((await cli(['show', 't'])).status).toBe(0);
      }
      expect((await cli(['undo', 't', 'corners'])).status).toBe(0);
      expect(saved().settings.map((/** @type {any} */ s) => s.thing)).toEqual([
        'accent',
        'spacing',
      ]);
    },
    T,
  );
});

describe('bare words for undo that hold a value', () => {
  it(
    "count the value as the setting's, never as a setting the theme lacks",
    async () => {
      await threeSet();
      const r = await cli(['undo', 't', 'corners pill accent']);
      expect(r.json.error).toMatch(/names 2 settings/);
      expect(r.json.error).not.toMatch(/sets no/);
      expect(offered(r.json)).toEqual([
        ['undo', 't', 'corners'],
        ['undo', 't', 'accent'],
      ]);
      for (const line of offered(r.json))
        expect((await cli(line)).status).toBe(0);
    },
    T,
  );
});

describe("a setting's name where the theme goes", () => {
  it(
    'in other letters or as a token offers the themes to look at, never a new theme',
    async () => {
      for (const args of [
        ['undo', 'Corners'],
        ['undo', '--color-accent'],
        ['show', 'Corners'],
      ]) {
        const r = await cli(args);
        const lines = offered(r.json);
        expect(lines.length).toBeGreaterThan(0);
        expect(lines.some((/** @type {string[]} */ l) => l[0] === 'new')).toBe(
          false,
        );
        for (const line of lines) expect((await cli(line)).status).toBe(0);
      }
    },
    T,
  );
});

describe('several lines pasted as one argument', () => {
  it(
    'gives one line each, each of which runs',
    async () => {
      for (const text of [
        'corners: pill\naccent: blue',
        'corners = pill (whole theme)\naccent = red (whole theme)',
        '--color-accent (dark): #f1f1f1 -> red\ncorners: pill;',
      ]) {
        fs.writeFileSync(file(), fresh);
        const r = await cli(['set', 't', text]);
        expect(r.json.error).toMatch(/holds 2 settings/);
        const lines = offered(r.json);
        expect(lines).toHaveLength(2);
        for (const line of lines) expect((await cli(line)).status).toBe(0);
      }
      fs.writeFileSync(file(), fresh);
      const dark = await cli([
        'set',
        't',
        '--color-accent (dark): #f1f1f1 -> red\ncorners: pill',
      ]);
      expect(offered(dark.json)[0]).toEqual([
        'set',
        't',
        '--color-accent',
        'red',
        '--mode',
        'dark',
      ]);
    },
    T,
  );
});

describe('an empty pasted object with a separator', () => {
  it(
    'points to the dials and set help',
    async () => {
      const r = await cli(['set', 't', '{,}']);
      expect(offered(r.json)).toEqual([
        ['how', '--list', 'dials'],
        ['set', '--help'],
      ]);
    },
    T,
  );
});

describe('a pasted label that is a part typo or no mode', () => {
  it(
    'reads a part typo as that part and a state as the state, and never drops the label',
    async () => {
      const crad = await cli(['set', 't', 'background-color (crad) -> red']);
      expect(offered(crad.json)[0]).toEqual([
        'set',
        't',
        'background-color',
        'red',
        '--on',
        'card',
      ]);
      expect((await cli(offered(crad.json)[0])).status).toBe(0);
      fs.writeFileSync(file(), fresh);
      // A state label is the state.
      expect(
        (
          await cli([
            'set',
            't',
            'background-color (hover) -> red',
            '--on',
            'card',
          ])
        ).status,
      ).toBe(0);
      expect(saved().settings).toContainEqual(
        expect.objectContaining({on: 'card', state: 'hover', value: 'red'}),
      );
      // A label that is neither a mode, a part nor a state is never dropped
      // for a both-modes line.
      fs.writeFileSync(file(), fresh);
      const junk = await cli(['set', 't', 'background-color (zzzq) -> red']);
      expect(junk.status).not.toBe(0);
      expect(
        offered(junk.json).some(
          (/** @type {string[]} */ l) => l[0] === 'set' && !l.includes('--on'),
        ),
      ).toBe(false);
    },
    T,
  );
});

describe('a damaged entry beside a clean one of the same scope', () => {
  it(
    'offers only the undo, never a set over the clean entry',
    async () => {
      editFile(d => {
        d.settings = [
          {thing: 'padding', value: '4px', source: 'property', on: 'card'},
          {
            thing: 'padding',
            value: '8px',
            source: 'property',
            on: 'card',
            state: 5,
          },
        ];
      });
      const r = await cli(['show', 't']);
      const lines = offered(r.json);
      expect(lines.some((/** @type {string[]} */ l) => l[0] === 'set')).toBe(
        false,
      );
      expect(lines[0]).toEqual(['undo', 't', 'padding', '--on', 'card']);
      expect((await cli(lines[0])).status).toBe(0);
      expect(saved().settings).toEqual([
        {thing: 'padding', value: '4px', source: 'property', on: 'card'},
      ]);
    },
    T,
  );
});
