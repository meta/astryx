// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A part typed in the setting's place (`set t button
 * background-color red`, `undo t card`): the line is the setting on that
 * part, as --on reads it, never a word the editor would not take. Every
 * offered line is followed.
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
  cwd = makeLinkedFixture('astryx-theme-part-first-', FIXTURE_PACKAGES);
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

describe("a part typed in the setting's place", () => {
  it(
    'set gets the setting on that part, with the scope typed kept',
    async () => {
      for (const [args, want] of /** @type {const} */ ([
        [
          ['button', 'background-color', '#2563eb'],
          ['set', 't', 'background-color', '#2563eb', '--on', 'button'],
        ],
        [
          ['card', 'padding', '20px'],
          ['set', 't', 'padding', '20px', '--on', 'card'],
        ],
        [
          ['cards', 'padding: 20px'],
          ['set', 't', 'padding', '20px', '--on', 'card'],
        ],
        [
          ['tooltip', 'background-color', 'black'],
          ['set', 't', 'background-color', 'black', '--on', 'tooltip'],
        ],
        [
          ['buttons', 'background-color', 'red'],
          ['set', 't', 'background-color', 'red', '--on', 'button'],
        ],
        [
          ['card', 'corners', 'pill'],
          ['set', 't', 'corners', 'pill', '--on', 'card'],
        ],
        [
          ['button', 'color', 'red', '--state', 'hover'],
          ['set', 't', 'color', 'red', '--on', 'button', '--state', 'hover'],
        ],
      ])) {
        fs.writeFileSync(file(), fresh);
        const r = await cli(['set', 't', ...args]);
        expect(r.status, args.join(' ')).not.toBe(0);
        expect(offered(r.json), args.join(' ')).toEqual([want]);
        expect(r.json.suggestions ?? []).not.toContainEqual(
          expect.objectContaining({reason: 'did you mean'}),
        );
        expect(saved().settings).toEqual([]);
        expect((await cli([...want])).status, want.join(' ')).toBe(0);
      }
      // A value of the dial that shares the part's name is still the dial.
      fs.writeFileSync(file(), fresh);
      expect((await cli(['set', 't', 'buttons', 'caps'])).status).toBe(0);
    },
    T,
  );

  it(
    'undo gets the undo of each setting the theme holds on that part',
    async () => {
      fs.writeFileSync(file(), fresh);
      await cli([
        'set',
        't',
        'background-color',
        '#fff7ed',
        '--on',
        'card',
        '--mode',
        'light',
      ]);
      await cli(['set', 't', 'padding', '20px', '--on', 'card']);
      const r = await cli(['undo', 't', 'card']);
      expect(r.status).not.toBe(0);
      expect(offered(r.json)).toEqual([
        ['undo', 't', 'background-color', '--on', 'card', '--mode', 'light'],
        ['undo', 't', 'padding', '--on', 'card'],
      ]);
      const one = await cli(['undo', 't', 'card', 'padding']);
      expect(offered(one.json)).toEqual([
        ['undo', 't', 'padding', '--on', 'card'],
      ]);
      for (const line of offered(r.json))
        expect((await cli([...line])).status, line.join(' ')).toBe(0);
      expect(saved().settings).toEqual([]);
    },
    T,
  );
});
