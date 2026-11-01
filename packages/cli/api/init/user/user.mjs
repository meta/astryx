// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file init.user leaf — the `--user` path behind `astryx init`.
 *
 * `user(options)` writes, refreshes, or (with `remove`) removes the
 * computer-level agent text: one skill file in the home folder, linked into
 * the skill folders agents read (spec AST-081 FR7, FR8). It records the
 * setting and the links it made in the settings file, so the global copy,
 * which keeps the text current in the background, does the same, or, after
 * `remove`, writes nothing. The adapter does every file access. It works in any
 * folder and never touches a project's agent docs. A file without the Astryx
 * markers, one a person edited, or a symlinked one is kept as it is. When no
 * `astryx` on the computer's search path runs the Astryx CLI, the text is
 * still written and the receipt warns that the CLI should be installed for
 * the computer.
 *
 * @input  `remove`; the home folder, search path, and settings of
 *   the computer
 * @output an `init.user` receipt
 * @position packages/cli/api/init — dispatched by init.mjs
 */

import {
  COMPUTER_COMMAND,
  COMPUTER_INSTALL_STEP,
  applyComputerAgentText,
  displayHomePath,
} from '../_adapter.mjs';
import {logger} from '../../logger.mjs';

/**
 * @param {string} file
 * @param {string} home
 * @returns {string}
 */
const display = (file, home) => displayHomePath(file, home);

/** @type {Record<import('../init.type.mjs').InitUserAction, string>} */
const ACTION_LINES = {
  written: '[ok] Wrote',
  linked: '[ok] Linked',
  unchanged: '[ok] Already current:',
  removed: '[ok] Removed',
  absent: '[ok] Nothing to remove:',
  kept: '[skip] Kept',
};

/** @type {Record<'edited' | 'not-astryx', string>} */
const KEPT_REASONS = {
  edited: '(edited since Astryx wrote it; delete it to get the current text):',
  'not-astryx': '(not created by Astryx):',
};

/**
 * Write or remove the computer-level agent text and return an `init.user`
 * receipt. Progress is emitted through the shared `logger` (silent by
 * default); warnings go to its warn channel.
 *
 * @param {{remove?: boolean}} [options]
 * @returns {Promise<import('../init.type.mjs').InitUserResponse>}
 */
export async function user({remove = false} = {}) {
  const {home, command, files, cliOnSearchPath} = applyComputerAgentText({
    remove,
  });
  /** @type {string[]} */
  const warnings = [];
  // A host's door is its own command; only the plain `astryx` needs a copy of
  // the CLI installed for the computer.
  if (!remove && command === COMPUTER_COMMAND && !cliOnSearchPath) {
    warnings.push(
      `No \`${COMPUTER_COMMAND}\` command on this computer runs the Astryx CLI, so agents cannot run the commands this text names. Install the CLI for the computer: ${COMPUTER_INSTALL_STEP}`,
    );
  }
  for (const file of files) {
    const reason = file.reason ? ` ${KEPT_REASONS[file.reason]}` : '';
    logger.log(
      `${ACTION_LINES[file.action]}${reason || (file.action === 'kept' ? ':' : '')} ${display(file.path, home)}`,
    );
  }
  for (const warning of warnings) logger.warn(`[warn] ${warning}`);
  return {
    type: 'init.user',
    data: {files, command, warnings},
  };
}
