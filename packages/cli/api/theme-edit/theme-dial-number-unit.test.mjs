// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A dial whose number is in pixels (text-size) takes that number
 * typed with its unit, as set, undo, new and the settings file read it.
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
  cwd = makeLinkedFixture('astryx-theme-dial-number-unit-', FIXTURE_PACKAGES);
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

describe('a pixel dial given its number with px', () => {
  it(
    'is that number, in set and undo',
    async () => {
      for (const typed of ['24px', '24 PX', '24Px']) {
        fs.writeFileSync(file(), fresh);
        expect((await cli(['set', 't', 'text-size', typed])).status).toBe(0);
        expect(saved().settings).toEqual([
          {thing: 'text-size', value: '24', source: 'dial'},
        ]);
      }
      expect((await cli(['undo', 't', 'text-size', '24px'])).status).toBe(0);
      expect(saved().settings).toEqual([]);
    },
    T,
  );

  it(
    'past its range is refused naming what was typed, with the end it takes',
    async () => {
      const r = await cli(['set', 't', 'text-size', '40px']);
      expect(r.status).not.toBe(0);
      expect(r.json.error).toMatch(/not "40px"/);
      expect(offered(r.json)[0]).toEqual(['set', 't', 'text-size', '32']);
      expect((await cli(offered(r.json)[0])).status).toBe(0);
    },
    T,
  );

  it(
    'is read from a settings file and by new',
    async () => {
      editFile(d => {
        d.settings = [{thing: 'text-size', value: '20px', source: 'dial'}];
      });
      const r = await cli(['show', 't']);
      expect(r.status).toBe(0);
      expect(r.json.data.notes).toContain(
        'text-size was saved as "20px", read as 20',
      );
      expect(
        (await cli(['new', 't2', '--like', 'neutral', '--text-size', '22px']))
          .status,
      ).toBe(0);
      expect(
        JSON.parse(
          fs.readFileSync(path.join(cwd, 'themes/t2/t2.settings.json'), 'utf8'),
        ).settings,
      ).toEqual([{thing: 'text-size', value: '22', source: 'dial'}]);
    },
    T,
  );
});
