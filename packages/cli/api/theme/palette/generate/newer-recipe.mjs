// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A palette config whose recipe a newer CLI made. A newer CLI's recipe
 * is not broken input: the refusal names the recipe, the recipes this CLI
 * knows, and the command that updates the CLI.
 * @input A palette config's `recipe`, and where the config was read
 * @output The newer recipe, or null; the refusal for it
 * @position api/theme/palette/generate — read by `theme palette generate`
 *   before it generates
 */

import {ERROR_CODES} from '../../../../foundation/response/error-codes.mjs';
import {cliUpdateStep} from '../../../../foundation/release/notices.mjs';
import {cliVersion} from '../../../../foundation/release/run-context.mjs';
import {AstryxError} from '../../../error.mjs';
import {PALETTE_RECIPES} from './generator.mjs';

const RECIPE_NUMBER = /^astryx-oklch-v(\d+)$/;

/**
 * The recipe when it is one a newer CLI made: an Astryx recipe numbered past
 * every recipe this CLI knows. Null otherwise, also for a recipe that is not
 * an Astryx one, which the generator refuses as unknown.
 * @param {unknown} recipe
 * @returns {string | null}
 */
export function newerRecipe(recipe) {
  if (typeof recipe !== 'string' || PALETTE_RECIPES.includes(recipe)) {
    return null;
  }
  const number = RECIPE_NUMBER.exec(recipe)?.[1];
  const newest = Math.max(
    ...PALETTE_RECIPES.map(known => Number(RECIPE_NUMBER.exec(known)?.[1])),
  );
  return number != null && Number(number) > newest ? recipe : null;
}

/**
 * The refusal for a config a newer CLI made, keeping the code of every
 * palette generation refusal. The step it names fits where the CLI runs (see
 * `cliUpdateStep`): in a project, its CLI and Core together.
 * @param {{recipe: string, file: string, cwd?: string}} options
 * @returns {AstryxError}
 */
export function newerRecipeRefusal({recipe, file, cwd = process.cwd()}) {
  const step = cliUpdateStep({cwd});
  const then = step.runs
    ? `Run the command again with the newest CLI: ${step.command}`
    : `Update the CLI, then run the command again: ${step.command}`;
  return new AstryxError(
    `${file} was made with a newer Astryx CLI: its colors use the ${recipe} recipe, and this CLI (${cliVersion()}) knows ${PALETTE_RECIPES.join(', ')}. ${then}. Nothing was changed.`,
    [{name: step.command, reason: `a CLI that knows the ${recipe} recipe`}],
    ERROR_CODES.ERR_PALETTE_GENERATION,
  );
}
