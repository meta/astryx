// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A set of a property typed in other letters fixes that property
 * listed twice, never a swap line that loops; a top-level `base` is the
 * base, with a note. Every offered line is followed.
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
  cwd = makeLinkedFixture('astryx-theme-n-f44-', FIXTURE_PACKAGES);
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

describe('a set of a property typed in other letters, listed twice', () => {
  it(
    'keeps the one value, never offering a swap line',
    async () => {
      for (const typed of ['Background-Color', 'BACKGROUND-COLOR']) {
        fs.writeFileSync(file(), fresh);
        editFile(d => {
          d.settings = [
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
          ];
        });
        const r = await cli(['set', 't', typed, 'green', '--on', 'card']);
        expect(r.status).toBe(0);
        expect(saved().settings).toEqual([
          expect.objectContaining({
            thing: 'background-color',
            value: 'green',
            on: 'card',
          }),
        ]);
      }
    },
    T,
  );
});

describe('a top-level base', () => {
  it(
    'is the base, with a note',
    async () => {
      editFile(d => {
        d.base = d.like;
        delete d.like;
      });
      const r = await cli(['show', 't']);
      expect(r.status).toBe(0);
      expect(r.json.data.like).toBe('neutral');
      expect(r.json.data.notes.join('\n')).toMatch(
        /writes the base as "base", read as like/,
      );
      expect((await cli(['set', 't', 'spacing', 'roomy'])).status).toBe(0);
      expect(saved().like).toBe('neutral');
      expect(saved().base).toBeUndefined();
    },
    T,
  );
});
