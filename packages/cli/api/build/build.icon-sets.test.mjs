// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Build reads the start template's needs from the source `astryx
 * template` writes (AST-084 FR9): where an installed icon set draws the
 * template's icons, the library it replaces is no missing dependency, and one
 * note names the set. With no icon-set package, and with two and no order,
 * the notes are what they always were.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {runCli} from '../../test-utils/run-cli.mjs';
import {writeIconSetProject} from '../../test-utils/icon-set-fixture.mjs';

const SLOW = 60_000;
const QUERY = 'a settings page';
const INSTALL =
  'Install missing dependencies: npm install @heroicons/react@"^2.2.0"';

/** @type {string} */
let tmp;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-build-icon-sets-'));
});
afterAll(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

/**
 * The start template's notes, from build's JSON.
 * @param {string} name
 * @param {Array<Record<string, unknown>>} packages the icon packages installed
 */
async function startNotes(name, packages) {
  const cwd = writeIconSetProject(path.join(tmp, name), {packages});
  const res = await runCli(['build', QUERY, '--json'], cwd);
  expect(res.code).toBe(0);
  const start = JSON.parse(res.stdout).data.start;
  expect(start.name).toBe('settings');
  return start.notes;
}

describe('build with icon sets', () => {
  it(
    'no icon-set package: the notes name the icon library to install',
    async () => {
      expect(await startNotes('none', [])).toEqual([INSTALL]);
    },
    SLOW,
  );

  it(
    'one icon-set package: no install note for the library it replaces, and one note names the set',
    async () => {
      const notes = await startNotes('one', [{}]);
      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatch(
        /^Icons come from your icon set @acme\/glyphs\/glyphs\. Find one by meaning: `.+ experimental icon <words>`$/u,
      );
    },
    SLOW,
  );

  it(
    'two icon-set packages and no order: the template keeps its icons, so the notes are unchanged',
    async () => {
      expect(await startNotes('two', [{}, {name: '@acme/lines'}])).toEqual([
        INSTALL,
      ]);
    },
    SLOW,
  );
});
