// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Environment adapter for `init --user`: the home folder, the settings
 * file, the per-user state, and the search path (spec AST-081 FR7, FR8;
 * architecture:cli-surface INV21).
 *
 * @input  the home folder, the settings file, the search path
 * @output the computer-level agent text written or removed, with the setting
 *   and the links recorded
 * @position packages/cli/api/init — imported by the user leaf only
 */

import * as os from 'node:os';
import {
  COMPUTER_COMMAND,
  COMPUTER_INSTALL_STEP,
  astryxOnSearchPath,
  computerAgentCommand,
  displayHomePath,
  removeComputerAgentText,
  writeComputerAgentText,
} from '../../foundation/agent-docs/computer-agent-text.mjs';
import {
  computerAgentTextSettings,
  recordComputerAgentTextSettings,
} from '../../foundation/env/user-settings.mjs';
import {recordAgentTextWritten} from '../../foundation/release/global-state.mjs';
import {cliVersion} from '../../foundation/release/run-context.mjs';

export {COMPUTER_COMMAND, COMPUTER_INSTALL_STEP, displayHomePath};

/**
 * Write or refresh the computer-level agent text, or remove it, and record
 * the setting and the links Astryx made; after a write, record the release
 * that wrote it.
 * @param {{remove: boolean}} options
 * @returns {{home: string, command: string, files: import('./init.type.mjs').InitUserFile[], cliOnSearchPath: boolean}}
 */
export function applyComputerAgentText({remove}) {
  const home = os.homedir();
  const command = computerAgentCommand();
  const recorded = computerAgentTextSettings().links;
  /** @type {import('./init.type.mjs').InitUserFile[]} */
  let files;
  if (remove) {
    files = removeComputerAgentText({home, links: recorded});
    recordComputerAgentTextSettings({install: false, links: []});
  } else {
    const written = writeComputerAgentText({home, command});
    files = written.rows;
    recordComputerAgentTextSettings({
      install: true,
      links: [...new Set([...recorded, ...written.links])],
    });
    recordAgentTextWritten(cliVersion());
  }
  return {home, command, files, cliOnSearchPath: astryxOnSearchPath()};
}
