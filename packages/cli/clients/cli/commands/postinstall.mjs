// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file postinstall command — the hidden `astryx postinstall` hook.
 *
 * Prints the welcome box (lib/welcome-box.mjs). Hidden from help and the
 * manifest; it looks nothing up and does not support --json.
 *
 * The command surface comes from the colocated CommandDoc via `defineCommand`.
 */

import {getCliInvocation} from '../../../foundation/env/package-manager.mjs';
import {emit, code} from '../formatters/index.mjs';
import {defineCommand} from '../lib/define-command.mjs';
import {welcomeBox} from '../lib/welcome-box.mjs';
import {NO_RESULT_SET} from '../../../foundation/debug/index.mjs';
import {doc as postinstallCommand} from './postinstall.doc.mjs';

/**
 * @param {import('commander').Command} program
 */
export function registerPostinstall(program) {
  defineCommand(program, postinstallCommand, {
    hidden: true,
    action: () => {
      emit(code(welcomeBox(getCliInvocation())));
      // Prints the welcome box. Nothing is looked up.
      return NO_RESULT_SET;
    },
  });
}
