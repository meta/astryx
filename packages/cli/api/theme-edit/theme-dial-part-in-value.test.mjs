// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A dial's value that names a part or group (plural included): the
 * line keeps the change on that part, never the whole theme, even when
 * the label also spells another dial. Every offered line is followed.
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
  cwd = makeLinkedFixture('astryx-theme-dial-part-in-value-', FIXTURE_PACKAGES);
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

describe("a dial's value that names a part", () => {
  it(
    'gets the line on that part, plural or singular, label or not',
    async () => {
      for (const [args, want] of /** @type {const} */ ([
        [
          ['spacing', 'buttons: roomy'],
          ['set', 't', 'spacing', 'roomy', '--on', 'button'],
        ],
        [
          ['spacing', 'button: roomy'],
          ['set', 't', 'spacing', 'roomy', '--on', 'button'],
        ],
        [
          ['corners', 'buttons: pill'],
          ['set', 't', 'corners', 'pill', '--on', 'button'],
        ],
        [
          ['corners', 'cards: pill'],
          ['set', 't', 'corners', 'pill', '--on', 'card'],
        ],
        [
          ['corners', 'card pill'],
          ['set', 't', 'corners', 'pill', '--on', 'card'],
        ],
        [
          ['corners', 'pill on card'],
          ['set', 't', 'corners', 'pill', '--on', 'card'],
        ],
        [
          ['spacing', 'button compact'],
          ['set', 't', 'spacing', 'compact', '--on', 'button'],
        ],
      ])) {
        fs.writeFileSync(file(), fresh);
        const r = await cli(['set', 't', ...args]);
        expect(r.status, args.join(' ')).not.toBe(0);
        expect(offered(r.json), args.join(' ')).toEqual([want]);
        expect(saved().settings).toEqual([]);
        const ran = await cli([...want]);
        expect(ran.status, want.join(' ')).toBe(0);
        expect(saved().settings).toEqual([
          expect.objectContaining({
            thing: want[2],
            value: want[3],
            on: want[5],
          }),
        ]);
      }
    },
    T,
  );

  it(
    'a label naming another dial and no part is still that dial',
    async () => {
      fs.writeFileSync(file(), fresh);
      const r = await cli(['set', 't', 'accent', 'neutral: #64748b']);
      expect(offered(r.json)[0]).toEqual(['set', 't', 'neutral', '#64748b']);
    },
    T,
  );
});
