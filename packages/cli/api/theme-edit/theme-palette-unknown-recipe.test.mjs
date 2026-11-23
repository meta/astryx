// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A theme whose palette.config.json names a palette recipe this CLI
 * does not know, and no Astryx CLI makes, is refused plainly, and the file's
 * bytes stay exactly as they were. A newer CLI's recipe opens with its saved
 * colors; a color change is refused with what still works, and no update
 * step, as a CLI that makes that recipe may not be released.
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
import {PALETTE_RECIPES} from '../theme/palette/generate/generator.mjs';
import {newerRecipeRefusal} from '../theme/palette/generate/newer-recipe.mjs';
import {P} from './_tables.mjs';
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
        expect(e.message).toMatch(/no Astryx CLI makes/);
        expect(e.message).toMatch(/Fix that part of the file by hand/);
        expect(e.message).toContain(
          `set "recipe" to one of the recipes this CLI (${cliVersion()}) knows, ${PALETTE_RECIPES.join(', ')}`,
        );
        expect(e.message).not.toMatch(/update the CLI/);
        // Every editor command reads the theme and meets this refusal
        // again, so none is offered as the way out.
        expect(
          (e.suggestions ?? []).filter((/** @type {any} */ s) =>
            String(s.name).startsWith(P),
          ),
        ).toEqual([]);
        expect(fs.readFileSync(config).equals(before)).toBe(true);
      }
    },
    T,
  );

  it(
    "a newer CLI's recipe opens with its saved colors; a color change is refused with no update step",
    async () => {
      const data = JSON.parse(fs.readFileSync(config, 'utf8'));
      const newer = `astryx-oklch-v${PALETTE_RECIPES.length + 1}`;
      fs.writeFileSync(
        config,
        `${JSON.stringify({...data, recipe: newer}, null, 2)}\n`,
      );
      const before = fs.readFileSync(config);
      const shown = /** @type {any} */ (await themeEditShow('n', {cwd}));
      expect(
        [...(shown.data.notes ?? []), ...(shown.data.colorNotes ?? [])].join(
          '\n',
        ),
      ).toContain(`colors use the ${newer} recipe`);
      expect(fs.readFileSync(config).equals(before)).toBe(true);
      const e = await refusal(() =>
        themeEditSet('n', 'accent', '#e11d48', {cwd}),
      );
      expect(e.message).toContain(
        `colors use the ${newer} recipe, which this Astryx CLI (${cliVersion()}) does not make; its palette is kept as saved`,
      );
      expect(e.code).toBe(
        newerRecipeRefusal({recipe: newer, file: 'x', cwd}).code,
      );
      // No update step: a CLI that makes that recipe may not be released.
      expect(e.suggestions ?? []).toEqual([]);
      expect(fs.readFileSync(config).equals(before)).toBe(true);
    },
    T,
  );
});
