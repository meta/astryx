// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A theme whose palette.config.json names a palette recipe this CLI
 * does not know (one a newer CLI brings) opens with its saved colors, and
 * says so; a color change is refused plainly: the message names the recipe
 * and this CLI's version and gives the install of the newest CLI, and the
 * file's bytes stay exactly as they were, for any recipe name.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from './theme-edit.mjs';
import {cliVersion} from '../../foundation/release/run-context.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

const T = 240_000;

/** @type {string} */
let cwd;
/** @type {string} */
let config;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-unknown-recipe-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('n', {cwd, like: 'neutral'});
  await themeEditSet('n', 'accent', '#2563eb', {cwd});
  config = path.join(cwd, 'themes/n/palette.config.json');
  const data = JSON.parse(fs.readFileSync(config, 'utf8'));
  data.recipe = 'made-up-recipe-zz9';
  fs.writeFileSync(config, `${JSON.stringify(data, null, 2)}\n`);
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {() => Promise<unknown>} run */
const refusal = async run => {
  try {
    await run();
  } catch (e) {
    return /** @type {any} */ (e);
  }
  throw new Error('expected a refusal');
};

describe('a palette recipe this CLI does not know', () => {
  it(
    'show opens and names the recipe; a color change is refused, naming the recipe, the CLI version and the install, and leaves the file as it is',
    async () => {
      const before = fs.readFileSync(config);
      const shown = /** @type {any} */ (await themeEditShow('n', {cwd}));
      expect(
        [...(shown.data.notes ?? []), ...(shown.data.colorNotes ?? [])].join(
          '\n',
        ),
      ).toContain('palette recipe made-up-recipe-zz9');
      expect(fs.readFileSync(config).equals(before)).toBe(true);
      for (const run of [
        () => themeEditSet('n', 'accent', '#e11d48', {cwd}),
        () => themeEditUndo('n', {cwd, thing: 'accent'}),
      ]) {
        const e = await refusal(run);
        expect(e.message).toContain('palette recipe made-up-recipe-zz9');
        expect(e.message).toContain(`this CLI (${cliVersion()})`);
        expect(e.message).toMatch(/install the newest CLI/);
        expect(e.message).not.toMatch(/by hand/);
        // The way to a newer CLI is the project's own install of it, never
        // `astryx upgrade`, which migrates code and installs nothing.
        expect(JSON.stringify(e)).not.toContain('astryx upgrade');
        expect(JSON.stringify(e.suggestions ?? e)).toMatch(
          /(npm install|pnpm add|yarn add|bun add) @astryxdesign\/cli@latest/,
        );
        expect(fs.readFileSync(config).equals(before)).toBe(true);
      }
    },
    T,
  );
});
