// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A palette a newer CLI made names the newer recipe and the update.
 * @input Palette configs with a recipe numbered past this CLI's, and one
 *   with an unknown recipe that is not an Astryx one
 * @output Proof that `theme palette generate` refuses a newer recipe with
 *   the update command, keeping the refusal's code, and that any other
 *   unknown recipe keeps the generator's refusal
 * @position api/theme/palette/generate — tests
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {ERROR_CODES} from '../../../../foundation/response/error-codes.mjs';
import {themePaletteGenerate} from './generate.mjs';
import {PALETTE_RECIPES} from './generator.mjs';
import {newerRecipe} from './newer-recipe.mjs';
import {cliUpdateStep} from '../../../../foundation/release/notices.mjs';
import {cliVersion} from '../../../../foundation/release/run-context.mjs';

/** @type {string} */
let cwd;
beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-newer-recipe-'));
});
afterEach(() => fs.rmSync(cwd, {recursive: true, force: true}));

const NEWER = `astryx-oklch-v${PALETTE_RECIPES.length + 1}`;

/** @param {string} file @param {unknown} config */
function write(file, config) {
  const full = path.join(cwd, file);
  fs.mkdirSync(path.dirname(full), {recursive: true});
  fs.writeFileSync(full, JSON.stringify(config));
}

/** @param {() => unknown} run */
function refusal(run) {
  try {
    run();
  } catch (error) {
    return /** @type {any} */ (error);
  }
  throw new Error('expected a refusal');
}

describe('a palette a newer CLI made', () => {
  it('is a recipe numbered past every recipe this CLI knows', () => {
    expect(newerRecipe(NEWER)).toBe(NEWER);
    for (const known of PALETTE_RECIPES) expect(newerRecipe(known)).toBeNull();
    expect(newerRecipe('astryx-oklch-v0')).toBeNull();
    expect(newerRecipe('dusty')).toBeNull();
    expect(newerRecipe(undefined)).toBeNull();
  });

  it('theme palette generate names the recipe and the update', () => {
    write('palette.config.json', {
      recipe: NEWER,
      families: [{id: 'accent', seed: '#5b3cc4'}],
    });
    const error = refusal(() =>
      themePaletteGenerate('palette.config.json', {}, {cwd}),
    );
    expect(error.code).toBe(ERROR_CODES.ERR_PALETTE_GENERATION);
    // The whole message, with the step that fits where this CLI runs.
    const step = cliUpdateStep({cwd});
    expect(error.message).toBe(
      `palette.config.json was made with a newer Astryx CLI: its colors use the ${NEWER} recipe, and this CLI (${cliVersion()}) knows ${PALETTE_RECIPES.join(', ')}. ${step.runs ? 'Run the command again with the newest CLI' : 'Update the CLI, then run the command again'}: ${step.command}. Nothing was changed.`,
    );
    expect(error.suggestions?.[0]?.name).toBe(step.command);
  });

  it("in a project, names the step that moves the project's CLI and Core together", () => {
    write('package.json', {
      name: 'app',
      dependencies: {'@astryxdesign/core': '0.7.1'},
    });
    write('package-lock.json', {lockfileVersion: 3});
    write('palette.config.json', {
      recipe: NEWER,
      families: [{id: 'accent', seed: '#5b3cc4'}],
    });
    const error = refusal(() =>
      themePaletteGenerate('palette.config.json', {}, {cwd}),
    );
    expect(error.message).toMatch(
      /Update the CLI, then run the command again: npm install -E @astryxdesign\/core@\S+ @astryxdesign\/cli@\S+, then npx astryx upgrade --from 0\.7\.1 --apply\. Nothing was changed\.$/,
    );
  });

  it('any other unknown recipe keeps the refusal of the generator', () => {
    write('palette.config.json', {
      recipe: 'dusty',
      families: [{id: 'accent', seed: '#5b3cc4'}],
    });
    const error = refusal(() =>
      themePaletteGenerate('palette.config.json', {}, {cwd}),
    );
    expect(error.code).toBe(ERROR_CODES.ERR_PALETTE_GENERATION);
    expect(error.message).toMatch(/^Unknown palette recipe: dusty \(known: /);
  });
});
