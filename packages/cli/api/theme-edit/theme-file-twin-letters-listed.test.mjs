// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The settings file read as typed: a twin of a setting in other
 * letters is that setting listed twice, which a change of it fixes; a field
 * written several ways, none the editor's, is read once with a note; a
 * field the editor does not read is named; an entry pasted in the saved
 * form without a value is read by its thing. Every offered line is followed.
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
    'astryx-theme-file-twin-letters-listed-',
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

describe('a twin of a setting in other letters', () => {
  it(
    'is that setting listed twice, which set and undo of it fix',
    async () => {
      for (const [twin, args] of /** @type {const} */ ([
        [
          [
            {thing: 'accent', value: 'red', source: 'dial'},
            {thing: 'Accent', value: 'blue', source: 'dial'},
          ],
          ['set', 't', 'accent', 'green'],
        ],
        [
          [
            {thing: 'accent', value: 'red', source: 'dial'},
            {thing: 'Accent', value: 'blue', source: 'dial'},
          ],
          ['undo', 't', 'accent'],
        ],
        [
          [
            {
              thing: 'background-color',
              value: 'red',
              source: 'property',
              on: 'card',
            },
            {
              thing: 'Background-Color',
              value: 'blue',
              source: 'property',
              on: 'card',
            },
          ],
          ['set', 't', 'background-color', 'green', '--on', 'card'],
        ],
        [
          [
            {thing: '--color-accent', value: 'red', source: 'token'},
            {thing: '--Color-Accent', value: 'blue', source: 'token'},
          ],
          ['set', 't', '--color-accent', 'green'],
        ],
      ])) {
        fs.writeFileSync(file(), fresh);
        editFile(d => {
          d.settings = structuredClone(twin);
        });
        const shown = await cli(['show', 't']);
        expect(shown.json.error ?? '').toMatch(/listed twice/);
        const r = await cli([...args]);
        expect(r.status).toBe(0);
        const left = saved().settings.filter(
          (/** @type {any} */ s) =>
            s.thing.toLowerCase() === String(args[2]).toLowerCase(),
        );
        expect(left).toHaveLength(args[0] === 'set' ? 1 : 0);
        expect((await cli(['show', 't'])).status).toBe(0);
      }
    },
    T,
  );
});

describe("a field written several ways, none the editor's", () => {
  it(
    'is read once from the first, with a note, and written once',
    async () => {
      editFile(d => {
        d.settings = [
          {
            thing: 'background-color',
            value: 'red',
            source: 'property',
            On: 'card',
            '--on': 'button',
          },
          {thing: 'accent', setting: 'corners', value: 'red', source: 'dial'},
        ];
      });
      const r = await cli(['show', 't']);
      expect(r.status).toBe(0);
      const notes = r.json.data.notes.join('\n');
      expect(notes).toMatch(
        /background-color writes both "On" and "--on"; "On" is read \("card", not "button"\)/,
      );
      expect(notes).toMatch(
        /accent writes both "thing" and "setting"; "thing" is read/,
      );
      expect((await cli(['set', 't', 'spacing', 'roomy'])).status).toBe(0);
      const d = saved();
      expect(d.settings).toContainEqual({
        thing: 'background-color',
        value: 'red',
        source: 'property',
        on: 'card',
      });
      expect(JSON.stringify(d.settings)).not.toMatch(/"setting"|"--on"|"On"/);
    },
    T,
  );
});

describe('a saved field the editor does not read', () => {
  it(
    'is named with the field it is a typo of',
    async () => {
      editFile(d => {
        d.settings = [
          {
            thing: '--color-accent',
            value: 'red',
            source: 'token',
            modes: 'dark',
          },
        ];
      });
      const r = await cli(['show', 't']);
      expect(r.status).toBe(0);
      expect(r.json.data.notes.join('\n')).toMatch(
        /--color-accent has "modes", a field the editor does not read \(it reads "mode"\)/,
      );
    },
    T,
  );
});

describe('an entry pasted in the saved form without a value', () => {
  it(
    'is read by its thing, never as a setting named thing',
    async () => {
      expect(
        (await cli(['set', 't', 'padding', '8px', '--on', 'card'])).status,
      ).toBe(0);
      const r = await cli(['undo', 't', '{"thing":"padding","on":"card"}']);
      expect(offered(r.json)[0]).toEqual([
        'undo',
        't',
        'padding',
        '--on',
        'card',
      ]);
      expect((await cli(offered(r.json)[0])).status).toBe(0);
      const set = await cli(['set', 't', '{"thing":"padding","on":"card"}']);
      expect(offered(set.json).flat()).not.toContain('thing');
      for (const line of offered(set.json))
        expect((await runCli([...ED, ...line], {cwd})).status).toBe(0);
    },
    T,
  );
});
