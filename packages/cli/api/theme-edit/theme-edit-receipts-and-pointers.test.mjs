// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Refusals point at a line that works and receipts say what happened:
 * a word that names a dial and its value offers that dial's line whatever
 * the theme has now, a state a part does not have names the part drawn
 * inside it that does, a no-op mode or base set says nothing was built and
 * no undo step was added, and a one-mode theme lists its own mode's token
 * changes first.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew} from './theme-edit.mjs';
import {splitCommand} from './_vet.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
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
  cwd = makeLinkedFixture('astryx-theme-receipts-pointers-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
  fresh = fs.readFileSync(file(), 'utf8');
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string[]} args */
const cli = async args =>
  JSON.parse((await runCli([...args, '--json'], cwd)).stdout);

/** @param {any} r */
const names = r => (r.suggestions ?? []).map((/** @type {any} */ x) => x.name);

/** @param {string} line */
const follow = async line => {
  const args = splitCommand(line.slice(line.indexOf('experimental ')));
  if (!args) throw new Error(`cannot read ${line}`);
  return await cli(args);
};

describe('a word that names a dial and its value', () => {
  for (const surfaces of ['raised', 'flat'])
    it(
      `"shadows none" offers set t surfaces flat on a ${surfaces} theme`,
      async () => {
        fs.writeFileSync(file(), fresh);
        await cli([...ED, 'set', 't', 'surfaces', surfaces]);
        for (const word of ['shadows', 'elevation']) {
          const r = await cli([...ED, 'set', 't', word, 'none']);
          expect(r.error).toMatch(/surfaces flat does that/);
          expect(names(r)[0]).toMatch(/ set t surfaces flat$/);
        }
        const r = await cli([...ED, 'set', 't', 'shadows', 'none']);
        expect((await follow(names(r)[0])).error).toBeUndefined();
      },
      T,
    );

  it(
    '"dark-mode true" offers mode dark-only',
    async () => {
      fs.writeFileSync(file(), fresh);
      const r = await cli([...ED, 'set', 't', 'dark-mode', 'true']);
      expect(names(r)[0]).toMatch(/ set t mode dark-only$/);
    },
    T,
  );
});

describe('a state a part does not have', () => {
  it(
    'names the part drawn inside it that has it, as a line that works',
    async () => {
      fs.writeFileSync(file(), fresh);
      const r = await cli([
        ...ED,
        'set',
        't',
        'background-color',
        'red',
        '--on',
        'calendar',
        '--state',
        'today',
      ]);
      expect(r.error).toMatch(/"today" is not a state of calendar/);
      expect(r.error).toMatch(/calendar-day has it/);
      expect(names(r)[0]).toMatch(
        / set t background-color red --on calendar-day --state today$/,
      );
      expect((await follow(names(r)[0])).error).toBeUndefined();
    },
    T,
  );
});

describe('a no-op mode or base set', () => {
  it(
    'says nothing was built and no undo step was added',
    async () => {
      fs.writeFileSync(file(), fresh);
      await cli([...ED, 'set', 't', 'mode', 'dark-only']);
      const mode = await cli([...ED, 'set', 't', 'mode', 'dark-only']);
      expect(mode.data.notes[0]).toBe(
        'no change: mode is already dark-only, so nothing was built and no undo step was added',
      );
      const base = await cli([...ED, 'set', 't', 'base', 'neutral']);
      expect(base.data.notes[0]).toBe(
        'no change: base is already neutral, so nothing was built and no undo step was added',
      );
    },
    T,
  );
});

describe('a one-mode theme', () => {
  it(
    "lists its own mode's token changes first",
    async () => {
      fs.writeFileSync(file(), fresh);
      await cli([...ED, 'set', 't', 'mode', 'dark-only']);
      const r = await cli([...ED, 'set', 't', 'accent', '#2244cc']);
      const changed = /** @type {string[]} */ (r.data.changedTokens);
      expect(changed.length).toBeGreaterThan(0);
      expect(changed[0]).not.toMatch(/\(light\)/);
    },
    T,
  );
});
