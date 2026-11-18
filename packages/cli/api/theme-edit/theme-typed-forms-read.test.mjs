// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Typed and pasted forms read as meant: a part named beside a
 * property's value, the editor's own result line pasted with its head, a
 * new's settings written as pairs apart at commas, copy debris on a base,
 * a font family whose last word names a weight, a misspelled fallback.
 * Every offered line is followed.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
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

const T = 240_000;
const ED = ['experimental', 'theme', 'editor'];
/** @type {string} */
let cwd;
/** @type {string} */
let fresh;
const file = () => path.join(cwd, 'themes/t/t.settings.json');
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-typed-forms-read-', FIXTURE_PACKAGES);
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

describe("a part named beside a property's value", () => {
  it(
    'gets the line on that part, with the state a label names',
    async () => {
      for (const [args, want] of /** @type {const} */ ([
        [
          ['padding', 'card 8px'],
          ['set', 't', 'padding', '8px', '--on', 'card'],
        ],
        [
          ['padding', '8px card'],
          ['set', 't', 'padding', '8px', '--on', 'card'],
        ],
        [
          ['background-color', 'red on buttons'],
          ['set', 't', 'background-color', 'red', '--on', 'button'],
        ],
        [
          ['background-color', 'button = red'],
          ['set', 't', 'background-color', 'red', '--on', 'button'],
        ],
        [
          ['background-color', 'button:hover: red'],
          [
            'set',
            't',
            'background-color',
            'red',
            '--on',
            'button',
            '--state',
            'hover',
          ],
        ],
      ])) {
        fs.writeFileSync(file(), fresh);
        const r = await cli(['set', 't', ...args]);
        expect(offered(r.json)[0], args.join(' ')).toEqual(want);
        expect((await cli([...want])).status).toBe(0);
      }
    },
    T,
  );
});

describe("the editor's own result line pasted with its head", () => {
  it(
    'is read without the status and theme name',
    async () => {
      for (const line of [
        't: corners = pill (whole theme)',
        '[ok] t: corners = pill (whole theme)',
        't: corners round -> pill',
      ]) {
        fs.writeFileSync(file(), fresh);
        expect((await cli(['set', 't', line])).status, line).toBe(0);
        expect(saved().settings).toEqual([
          {thing: 'corners', value: 'pill', source: 'dial'},
        ]);
      }
    },
    T,
  );
});

describe("new's settings written as pairs apart at commas", () => {
  it(
    'offers every pair, and a comma inside a value stays the value',
    async () => {
      const r = await cli(['new', 'n2', 'like: neutral, corners: pill']);
      expect(offered(r.json)[0]).toEqual([
        'new',
        'n2',
        '--like',
        'neutral',
        '--corners',
        'pill',
      ]);
      expect((await cli(offered(r.json)[0])).status).toBe(0);
      const font = await cli([
        'new',
        'n3',
        'font: Inter, Arial',
        '--like',
        'neutral',
      ]);
      expect(offered(font.json)[0]).toEqual([
        'new',
        'n3',
        '--like',
        'neutral',
        '--font',
        'Inter, Arial',
      ]);
    },
    T,
  );
});

describe('a base with copy debris on it', () => {
  it(
    'gets the line, and no did-you-mean for the same word',
    async () => {
      for (const like of ["neutral'", 'neutral,']) {
        const r = await cli(['new', 'n4', '--like', like]);
        expect(
          (r.json.suggestions ?? []).filter(
            (/** @type {any} */ x) => x.reason === 'did you mean',
          ),
        ).toEqual([]);
        expect(offered(r.json)[0]).toEqual(['new', 'n4', '--like', 'neutral']);
      }
      const typo = await cli(['new', 'n4', '--like', 'nuetral']);
      expect(typo.json.suggestions).toContainEqual({
        name: 'neutral',
        reason: 'did you mean',
      });
    },
    T,
  );
});

describe('a font family whose last word names a weight', () => {
  it(
    'is kept as typed, with the family and weight lines in a note',
    async () => {
      const r = await cli(['set', 't', 'font', 'Bodoni Moda Bold']);
      expect(r.status).toBe(0);
      expect(r.json.data.setting.note).toMatch(
        /its last words \(Bold\) name a weight; if Bold was meant: .* set t font 'Bodoni Moda' and .* set t headings bold/,
      );
      expect((await cli(['set', 't', 'font', 'Bodoni Moda'])).status).toBe(0);
      expect((await cli(['set', 't', 'headings', 'bold'])).status).toBe(0);
    },
    T,
  );

  it(
    'a misspelled system fallback in a list is noted with its line',
    async () => {
      const r = await cli(['set', 't', 'font', 'Inter, Arail']);
      expect(r.status).toBe(0);
      expect(r.json.data.setting.note).toMatch(/set t font 'Inter, arial'/);
      expect((await cli(['set', 't', 'font', 'Inter, arial'])).status).toBe(0);
    },
    T,
  );
});
