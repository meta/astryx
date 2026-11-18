// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A page or text color a property names with no part is offered for
 * the mode it reads in first, as `how` answers it; and the words people
 * write for a dial (primary-color, shadows, dark-mode) reach that dial.
 */

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

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-page-text-color-property-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
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

describe('a whole-theme color a property names with no part', () => {
  for (const [value, mode] of [
    ['#0f172a', 'dark'],
    ['#ffffff', 'light'],
  ])
    it(
      `set t background ${value} leads with --mode ${mode}, and that line makes no new problem`,
      async () => {
        const r = await cli([...ED, 'set', 't', 'background', value]);
        expect(r.error).toBeDefined();
        expect(names(r)[0]).toMatch(
          new RegExp(
            ` set t --color-background-body '${value}' --mode ${mode}$`,
          ),
        );
        // The same color for both modes stays, after it.
        expect(names(r)[1]).toMatch(
          new RegExp(` set t --color-background-body '${value}'$`),
        );
        const followed = await follow(names(r)[0]);
        expect(followed.error).toBeUndefined();
        expect(followed.data.newProblems ?? []).toEqual([]);
        await cli([
          ...ED,
          'undo',
          't',
          '--color-background-body',
          '--mode',
          mode,
        ]);
      },
      T,
    );

  it(
    'a color that reads in both modes is offered once, with no mode',
    async () => {
      const r = await cli([...ED, 'set', 't', 'background', '#808080']);
      expect(r.error).toBeDefined();
      expect(names(r)[0]).toMatch(/ set t --color-background-body '#808080'$/);
    },
    T,
  );
});

describe('the words people write for a dial', () => {
  for (const [args, line] of [
    [['primary-color', '#0b5cff'], / set t accent '#0b5cff'$/],
    [['brand-color', 'red'], / set t accent red$/],
    // (The `surfaces flat` line is left out when the theme is flat
    // already; the dial is named either way.)
    [['shadows', 'none'], /^(?:surfaces|.* set t surfaces flat)$/],
    [['dark-mode', 'true'], / set t mode dark-only$/],
  ])
    it(
      `set t ${args.join(' ')} names the dial`,
      async () => {
        const r = await cli([...ED, 'set', 't', ...args]);
        expect(r.error).toBeDefined();
        expect(names(r)[0]).toMatch(line);
        expect(names(r)[0]).not.toMatch(/--list/);
        expect(String(r.error)).toMatch(/surfaces flat|accent|mode dark-only/);
      },
      T,
    );
});

void path;
