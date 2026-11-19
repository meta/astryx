// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Settings read as typed: a saved entry that writes one field two
 * ways (`value` and `Value`, `on` and `--on`) is read the editor's way,
 * said in a note, and written once by the next change; a pasted
 * declaration whose unquoted value went on past a space is read whole.
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
  cwd = makeLinkedFixture(
    'astryx-theme-saved-entry-writes-field-',
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

describe('a saved entry that writes a field two ways', () => {
  it(
    "is read the editor's way, noted by show, and written once by the next change",
    async () => {
      editFile(d => {
        d.settings = [
          {thing: 'accent', value: 'red', Value: 'blue', source: 'dial'},
          {
            thing: 'padding',
            value: '8px',
            source: 'property',
            on: 'card',
            '--on': 'button',
          },
        ];
      });
      const r = await cli(['show', 't']);
      expect(r.status).toBe(0);
      const notes = r.json.data.notes.join('\n');
      expect(notes).toMatch(
        /accent writes both "value" and "Value"; "value" is read/,
      );
      expect(notes).toMatch(
        /padding writes both "on" and "--on"; "on" is read/,
      );
      expect(JSON.stringify(r.json.data.settings)).not.toMatch(
        /"Value"|"--on"/,
      );
      expect((await cli(['set', 't', 'corners', 'pill'])).status).toBe(0);
      const d = saved();
      expect(d.settings).toContainEqual({
        thing: 'accent',
        value: 'red',
        source: 'dial',
      });
      expect(JSON.stringify(d.settings)).not.toMatch(/"Value"|"--on"/);
    },
    T,
  );
});

describe('a pasted declaration whose value has an unquoted comma and space', () => {
  it(
    'is read whole, and the line offered with the theme left out runs',
    async () => {
      const r = await cli(['set', 't', 'font=Inter,', 'Arial']);
      expect(r.status).toBe(0);
      expect(saved().settings).toContainEqual(
        expect.objectContaining({thing: 'font', value: 'Inter, Arial'}),
      );
      fs.writeFileSync(file(), fresh);
      const left = await cli(['set', 'font=Inter,', 'Arial']);
      const line = offered(left.json).find(
        (/** @type {string[]} */ l) => l[0] === 'set' && l[1] === 't',
      );
      expect(line).toBeDefined();
      expect((await cli(line)).status).toBe(0);
      expect((await cli(['undo', 't', 'font=Inter,', 'Arial'])).status).toBe(0);
    },
    T,
  );
});
