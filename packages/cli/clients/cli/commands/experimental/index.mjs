// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx experimental` — the command group every experimental CLI
 * command lives under (spec:AST-017 FR27). It has no behavior of its own:
 * bare, it prints its help; an unknown word is an unknown subcommand. Each
 * experiment registers its own subcommand here.
 */

import {
  NO_RESULT_SET,
  recordCommandResult,
} from '../../../../foundation/debug/index.mjs';
import {quoteCommandArgument} from '../../../../foundation/env/package-manager.mjs';
import {ERROR_CODES} from '../../../../foundation/response/error-codes.mjs';
import {cliError, themeGroupUnknownSubcommand} from '../../lib/cli-error.mjs';
import {defineCommand, markReportsResult} from '../../lib/define-command.mjs';
import {doc as experimentalGroup} from '../experimental.doc.mjs';
import {registerExperimentalIcon} from './icon.mjs';
import {registerExperimentalExport} from './export.mjs';
import {registerExperimentalTheme} from './theme.mjs';
import {servedSubcommands} from '../../lib/base-gate.mjs';
import {RENAMED_EXPERIMENTAL} from '../../lib/renamed-commands.mjs';

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
        const {message, suggestions} = themeGroupUnknownSubcommand(
          'experimental',
          String(extras[0]),
          servedSubcommands(experimental).map(command => command.name()),
          experimental,
        );
        return cliError(message, {
          suggestions,
          code: ERROR_CODES.ERR_UNKNOWN_SUBCOMMAND,
        });
      }
      experimental.help();
      return NO_RESULT_SET;
    },
  });
  registerExperimentalIcon(experimental, program);
  registerExperimentalExport(experimental, program);
  registerExperimentalTheme(experimental, program);
  for (const [old, renamed] of Object.entries(RENAMED_EXPERIMENTAL)) {
    // Hidden, and never runs the command: the old name's line fails and
    // names the new one, whatever options follow it, in text and in JSON.
    const command = experimental
      .command(old, {hidden: true})
      .helpOption(false)
      .allowUnknownOption()
      .allowExcessArguments()
      .argument('[words...]')
      .action(() => {
        recordCommandResult(NO_RESULT_SET);
        return renamedAnswer(old, renamed, process.argv.slice(2));
      });
    markReportsResult(command);
  }
}

/**
 * The answer to a renamed command's old name: the same line with the new
 * name, the options before it kept, each word quoted as the shell needs.
 * @param {string} old
 * @param {string} renamed
 * @param {string[]} words the words of the run after the program name
 */
function renamedAnswer(old, renamed, words) {
  const at = words.findIndex(
    (w, i) => w === old && words[i - 1] === 'experimental',
  );
  const line =
    at < 0
      ? ['experimental', renamed]
      : [...words.slice(0, at), renamed, ...words.slice(at + 1)];
  return cliError(`experimental ${old} is now experimental ${renamed}.`, {
    suggestions: [
      {
        name: ['astryx', ...line.map(w => quoteCommandArgument(w))].join(' '),
        reason: `the command is experimental ${renamed}`,
      },
    ],
    code: ERROR_CODES.ERR_UNKNOWN_SUBCOMMAND,
  });
}
