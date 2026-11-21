// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx experimental` — the command group every experimental CLI
 * command lives under (spec:AST-017 FR27). It has no behavior of its own:
 * bare, it prints its help; an unknown word is an unknown subcommand. Each
 * experiment registers its own subcommand here. A run that names one
 * subcommand loads only that one, as the root loads only the command a run
 * names.
 */

import {NO_RESULT_SET} from '../../../../foundation/debug/index.mjs';
import {quoteCommandArgument} from '../../../../foundation/env/package-manager.mjs';
import {ERROR_CODES} from '../../../../foundation/response/error-codes.mjs';
import {cliError, themeGroupUnknownSubcommand} from '../../lib/cli-error.mjs';
import {defineCommand} from '../../lib/define-command.mjs';
import {doc as experimentalGroup} from '../experimental.doc.mjs';
import {servedSubcommands} from '../../lib/base-gate.mjs';
import {scanRootArgs} from '../../lib/root-args.mjs';
import {RENAMED_EXPERIMENTAL} from '../../lib/renamed-commands.mjs';

/**
 * The group's subcommands, in help order, each loaded only when a run needs
 * it.
 * @type {ReadonlyArray<{name: string, load: () => Promise<(group: import('commander').Command, program: import('commander').Command) => void>}>}
 */
const SUBCOMMANDS = Object.freeze([
  {
    name: 'icon',
    load: async () => (await import('./icon.mjs')).registerExperimentalIcon,
  },
  {
    name: 'export',
    load: async () => (await import('./export.mjs')).registerExperimentalExport,
  },
  {
    name: 'import',
    load: async () => (await import('./import.mjs')).registerExperimentalImport,
  },
  {
    name: 'theme',
    load: async () => (await import('./theme.mjs')).registerExperimentalTheme,
  },
]);

/**
 * The one subcommand a run names, or null when the run needs them all: no
 * arguments given, or the word after `experimental` is a flag, `help` or a
 * word that names no subcommand. Commander dispatches the group's run to
 * that word.
 * @param {import('commander').Command} program the root, with its options
 * @param {string[] | undefined} argv the arguments after `astryx`
 * @returns {string | null}
 */
export function experimentalSubcommandOf(program, argv) {
  if (argv == null) return null;
  const root = scanRootArgs(argv, program.options);
  if (root.stopped || root.operand !== 'experimental') return null;
  const sub = scanRootArgs(argv.slice(root.operandAt + 1), []);
  if (sub.stopped) return null;
  return SUBCOMMANDS.some(command => command.name === sub.operand)
    ? /** @type {string} */ (sub.operand)
    : null;
}

/**
 * @param {import('commander').Command} program
 * @param {{argv?: string[]}} [options] `argv`, the arguments after `astryx`
 *   of a run of this group alone: load only the subcommand they name
 */
export async function registerExperimental(program, {argv} = {}) {
  // Each subcommand's module loads before the group is defined: a module
  // that fails to load then fails the whole group, and the root registers
  // its stand-in, as it does for a command that fails to load.
  const only = experimentalSubcommandOf(program, argv);
  const registrars = [];
  for (const command of SUBCOMMANDS) {
    if (only == null || command.name === only)
      registrars.push(await command.load());
  }
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
  for (const register of registrars) register(experimental, program);
  for (const [old, renamed] of Object.entries(RENAMED_EXPERIMENTAL)) {
    // Hidden, and never runs the command: the old name's line, and its help,
    // fail and name the new one, whatever options follow it, in text and in
    // JSON.
    const answer = () => renamedAnswer(old, renamed, process.argv.slice(2));
    const command = defineCommand(experimental, renamedDoc(old, renamed), {
      hidden: true,
      action: answer,
    })
      .helpOption(false)
      .allowUnknownOption()
      .allowExcessArguments();
    command.help = answer;
  }
}

/**
 * The CommandDoc of a renamed command's old name: hidden, so no help or
 * manifest shows it.
 * @param {string} old
 * @param {string} renamed
 * @returns {import('@astryxdesign/cli/authoring').CommandDoc}
 */
function renamedDoc(old, renamed) {
  return {
    type: 'command',
    name: `experimental ${old}`,
    displayName: `astryx experimental ${old}`,
    namespace: 'cli/commands',
    stability: 'experimental',
    summary: `The old name of experimental ${renamed}`,
    description: `The old name of experimental ${renamed}. It runs nothing: it fails and names the run with ${renamed}.`,
    args: [{name: 'words', variadic: true, required: false}],
    exitCodes: [{code: 1, when: 'always: the command has a new name'}],
  };
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
  // An option of the old name that is now its own command moves the run
  // there in one step: `render --reverse x.html` is `import x.html`.
  const moved = Object.entries(MOVED_BY_OPTION[old] ?? {}).find(([flag]) =>
    words.some((w, i) => i > at && (w === flag || w.startsWith(`${flag}=`))),
  );
  const target = moved ? moved[1] : renamed;
  const after = words
    .slice(at + 1)
    .filter(w => !moved || (w !== moved[0] && !w.startsWith(`${moved[0]}=`)));
  const line =
    at < 0
      ? ['experimental', target]
      : [...words.slice(0, at), target, ...after];
  return cliError(
    moved
      ? `experimental ${old} ${moved[0]} is now experimental ${target}.`
      : `experimental ${old} is now experimental ${renamed}.`,
    {
      suggestions: [
        {
          name: ['astryx', ...line.map(w => quoteCommandArgument(w))].join(' '),
          reason: `the command is experimental ${target}`,
        },
      ],
      code: ERROR_CODES.ERR_UNKNOWN_SUBCOMMAND,
    },
  );
}

/**
 * Options of a renamed command's old name that are now a command of their
 * own, by old name: the option, and the command it is now.
 * @type {Readonly<Record<string, Readonly<Record<string, string>>>>}
 */
const MOVED_BY_OPTION = Object.freeze({
  render: Object.freeze({'--reverse': 'import'}),
});
