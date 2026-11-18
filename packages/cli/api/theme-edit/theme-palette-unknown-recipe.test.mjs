// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A theme whose palette.config.json names a palette recipe this CLI
 * does not know (one a newer CLI brings) is refused plainly: the message
 * names the recipe and this CLI's version and says to update the CLI, and
 * the file's bytes stay exactly as they were, for any recipe name.
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
    'show, set and undo name the recipe and the CLI version, and leave the file as it is',
    async () => {
      const before = fs.readFileSync(config);
      for (const run of [
        () => themeEditShow('n', {cwd}),
        () => themeEditSet('n', 'corners', 'round', {cwd}),
        () => themeEditUndo('n', {cwd, thing: 'accent'}),
      ]) {
        const e = await refusal(run);
        expect(e.message).toContain('palette recipe made-up-recipe-zz9');
        expect(e.message).toContain(`this CLI (${cliVersion()})`);
        expect(e.message).toMatch(/update the CLI/);
        expect(e.message).not.toMatch(/by hand/);
        expect(JSON.stringify(e)).toContain('astryx upgrade');
        expect(fs.readFileSync(config).equals(before)).toBe(true);
      }
    },
    T,
  );
});
