// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The global copy's background Core step, as a CLI copy carries it, and
 *   its removal, so no test's run starts a download behind its back.
 * @input a CLI package folder (a placed or packed copy)
 * @output the folder without the step; an error when the step is not there
 * @position Test utilities: global-local-fixtures.mjs (`placeCli`) and
 *   packed-gather-cache-fixture.mjs (`usePackedCli`) remove the step through
 *   it; core-step.test.mjs checks that the release code starts this same file.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/** The step's path inside a CLI package folder. */
export const CORE_STEP = ['foundation', 'release', 'core-worker.mjs'];

/**
 * Remove the background Core step from a CLI copy. The removal fails when the
 * step is not there, so a renamed or moved step fails the test that places the
 * copy, not a later run that downloads a published Core.
 * @param {string} cliRoot the copy's package folder
 */
export function removeCoreStep(cliRoot) {
  fs.rmSync(path.join(cliRoot, ...CORE_STEP));
}
