// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file init command — thin wrapper around the init API.
 *
 * `astryx init` is non-interactive by default: it installs the agent-docs
 * cheat sheet with NO prompts, so it behaves identically for humans,
 * AI agents, CI, and piped I/O — it never hangs or errors on a missing TTY.
 * Non-interactive feature install: `astryx init --features agents,theme,template`
 * Re-runnable: safe to run multiple times, idempotent.
 *
 * All logic + side effects live in api/init/init.mjs. This handler only parses
 * flags, wires a plain logger to the CLI's humanLog/console.error, calls init(),
 * and maps the receipt's soft agent-docs error to the exit code.
 */

import {init} from '../../../api/init/init.mjs';
import {logger} from '../../../api/logger.mjs';
import {jsonOut} from '../../../foundation/response/json.mjs';
import {cliError} from '../lib/cli-error.mjs';
import {defineCommand} from '../lib/define-command.mjs';
import {NO_RESULT_SET} from '../../../foundation/debug/index.mjs';
import {doc as initCommand} from './init.doc.mjs';
import {doc as initFn} from '../../../api/init/init.doc.mjs';

/**
 * @param {import('commander').Command} program
 */
export function registerInit(program) {
  defineCommand(program, initCommand, {
    fn: initFn,
    action: async (/** @type {import('../../../api/init/init.mjs').InitOptions} */ options) => {
      const json = program.opts().json || false;
      // Silence the progress logger under --json so stdout carries only the
      // envelope. In human mode it writes log → stdout via humanLog and
      // warn/error → stderr.
      logger.setSilent(json);
      try {
        const receipt = await init(options, {cwd: process.cwd()});
        // A path-safety failure already printed its error but the run
        // continued; reflect it in the exit code (historical soft-error policy).
        // The receipt still reports it as `data.docsError` either way.
        if (receipt.type === 'init.run' && receipt.data.docsError?.kind === 'path-safety') {
          process.exitCode = 1;
        }
        if (json) jsonOut(receipt);
      } catch (err) {
        const e = /** @type {import('../../../api/error.mjs').AstryxError} */ (err);
        return cliError(e.message, {suggestions: e.suggestions, code: e.code});
      }
      // Setup writes files; there is nothing to look up. The receipt says what
      // landed.
      return NO_RESULT_SET;
    },
  });
}
