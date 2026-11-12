// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx experimental` — the command group every experimental CLI
 * command lives under (spec:AST-017 FR27). It has no behavior of its own:
 * bare, it prints its help; an unknown word is an unknown subcommand. Each
 * experiment registers its own subcommand here.
 */

import {NO_RESULT_SET} from '../../../../foundation/debug/index.mjs';
import {ERROR_CODES} from '../../../../foundation/response/error-codes.mjs';
import {
  cliError,
  experimentalSubcommandPointer,
  unknownSubcommandSuggestions,
} from '../../lib/cli-error.mjs';
import {getCliInvocation} from '../../../../foundation/env/package-manager.mjs';
import {defineCommand} from '../../lib/define-command.mjs';
import {doc as experimentalGroup} from '../experimental.doc.mjs';
import {registerExperimentalIcon} from './icon.mjs';
import {registerExperimentalRender} from './render.mjs';
import {registerExperimentalTheme} from './theme.mjs';

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
        const word = String(extras[0]);
        const invocation = getCliInvocation(process.cwd());
        const here = `${invocation} experimental`;
        const moved = experimentalSubcommandPointer(
          invocation,
          word,
          experimental,
        );
        return cliError(
          `unknown subcommand 'experimental ${word}'${moved.length > 0 ? `; it is ${moved[0].name}` : ''}`,
          {
            suggestions: unknownSubcommandSuggestions(
              here,
              word,
              (experimental.commands ?? []).map(command => command.name()),
              moved,
            ),
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
  registerExperimentalTheme(experimental, program);
}
