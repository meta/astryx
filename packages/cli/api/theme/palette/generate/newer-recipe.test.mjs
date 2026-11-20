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
import {runWithCliDoor} from '../../../../foundation/env/cli-command.mjs';
import {toErrorEnvelope} from '../../../../foundation/response/json.mjs';

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
    // The whole message, with the step that fits where this CLI runs:
    // outside a project, the copy that ran.
    const step = cliUpdateStep({cwd});
    expect(step.upgrade).toBeNull();
    expect(error.message).toBe(
      `palette.config.json was made with a newer Astryx CLI: its colors use the ${NEWER} recipe, and this CLI (${cliVersion()}) knows ${PALETTE_RECIPES.join(', ')}. ${step.runs ? 'Run the command again with the newest CLI' : 'Update the CLI, then run the command again'}: ${step.install}. Nothing was changed.`,
    );
    expect(error.suggestions?.map((/** @type {any} */ s) => s.name)).toEqual([
      step.install,
    ]);
  });

  it("in a project, names the install of the project's CLI and Core, then the bare codemod run", () => {
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
    const step = cliUpdateStep({cwd});
    expect(step.install).toMatch(
      /^npm install -E @astryxdesign\/core@\S+ @astryxdesign\/cli@\S+$/,
    );
    expect(error.message).toContain(
      "Update the CLI and bring the project's code to it with the commands below, in order; then run the command again. Nothing was changed.",
    );
    // A command the CLI names is a suggestion, never in the message: printed
    // there, it would lack the command name the picker chooses.
    expect(error.message).not.toMatch(/(^|[\s:;,])astryx\s/);
    expect(error.suggestions?.map((/** @type {any} */ s) => s.name)).toEqual([
      step.install,
      'astryx upgrade --from 0.7.1 --apply',
    ]);
  });

  it('carries every command bare in JSON, whatever the command name (spec AST-081 FR5)', async () => {
    write('package.json', {
      name: 'app',
      dependencies: {'@astryxdesign/core': '0.7.1'},
    });
    write('package-lock.json', {lockfileVersion: 3});
    write('palette.config.json', {
      recipe: NEWER,
      families: [{id: 'accent', seed: '#5b3cc4'}],
    });
    const error = await runWithCliDoor('acme astryx', async () =>
      refusal(() => themePaletteGenerate('palette.config.json', {}, {cwd})),
    );
    const envelope = JSON.stringify(
      toErrorEnvelope(error, error.suggestions, error.code),
    );
    expect(envelope).not.toContain('acme astryx');
    expect(envelope).not.toMatch(/(npx|pnpm exec|yarn|bunx) astryx/);
    expect(envelope).toContain('"astryx upgrade --from 0.7.1 --apply"');
  });

  it('a run a host door started outside a project names the release it needs and no command', async () => {
    write('palette.config.json', {
      recipe: NEWER,
      families: [{id: 'accent', seed: '#5b3cc4'}],
    });
    const error = await runWithCliDoor('acme astryx', async () =>
      refusal(() => themePaletteGenerate('palette.config.json', {}, {cwd})),
    );
    expect(error.code).toBe(ERROR_CODES.ERR_PALETTE_GENERATION);
    expect(error.message).toMatch(
      /Update the Astryx CLI that runs this command to (\S+ or newer|the newest release), then run the command again\. Nothing was changed\.$/,
    );
    expect(error.suggestions ?? []).toEqual([]);
    const envelope = JSON.stringify(
      toErrorEnvelope(error, error.suggestions, error.code),
    );
    expect(envelope).not.toContain('acme astryx');
    expect(envelope).not.toMatch(
      /(npx|pnpm dlx|yarn dlx|bunx) @astryxdesign\/cli/,
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
