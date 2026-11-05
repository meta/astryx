// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx experimental` — the command group every experimental CLI
 * command lives under (spec:AST-017 FR27). It has no behavior of its own:
 * bare, it prints its help; an unknown word is an unknown subcommand. Each
 * experiment registers its own subcommand here.
 */

import {NO_RESULT_SET} from '../../../../foundation/debug/index.mjs';
import {ERROR_CODES} from '../../../../foundation/response/error-codes.mjs';
import {cliError} from '../../lib/cli-error.mjs';
import {defineCommand} from '../../lib/define-command.mjs';
import {doc as experimentalGroup} from '../experimental.doc.mjs';
import {registerExperimentalIcon} from './icon.mjs';
import {registerExperimentalRender} from './render.mjs';

/** @param {import('commander').Command} program */
export function registerExperimental(program) {
  /** @type {import('commander').Command} */
  const experimental = defineCommand(program, experimentalGroup, {
    action: (
      /** @type {unknown} */ options,
      /** @type {import('commander').Command} */ cmd,
    ) => {
      const extras = cmd?.args ?? [];
      if (extras.length > 0) {
        return cliError(
          `unknown subcommand 'experimental ${String(extras[0])}'`,
          {
            suggestions: (experimental.commands ?? []).map(command => ({
              name: command.name(),
              reason: 'available subcommand',
            })),
            code: ERROR_CODES.ERR_UNKNOWN_SUBCOMMAND,
          },
        );
      }
      experimental.help();
      return NO_RESULT_SET;
    },
  });
  registerExperimentalIcon(experimental, program);
  registerExperimentalRender(experimental, program);
}
