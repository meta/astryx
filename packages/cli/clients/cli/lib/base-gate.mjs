// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The run's base on the Commander side: which commands and options
 * help lists, the line that counts the hidden ones, and the one requirement
 * check that runs before any command body.
 * @input the program and the run's base resolution
 * @output help filters, help text, and the preAction check
 * @position clients/cli/lib — the CLI side of foundation/bases
 */

import {Help} from 'commander';
import {CORE_BASE_NAME, coreBase} from '../../../foundation/bases/core.mjs';
import {
  loadedRunBase,
  requestedBase,
} from '../../../foundation/bases/state.mjs';
import {
  formatCliCommand,
  quoteCommandArgument,
} from '../../../foundation/env/package-manager.mjs';
import {
  checkRequirements,
  isAvailable,
  longFlag,
  missingSteps,
  refusalLine,
} from '../../../foundation/bases/requirements.mjs';
import {isJsonMode, jsonError} from '../../../foundation/response/json.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';
import {setOutcome} from '../../../foundation/debug/index.mjs';
import {cliError} from './cli-error.mjs';
import {isOutsideProject} from '../../../foundation/env/project-scope.mjs';
import {
  commandDocsOf,
  servedDescription,
  servedOptionDescription,
  setHelpExampleFilter,
} from './define-command.mjs';
import {commandPath} from './command-path.mjs';

/** @typedef {import('commander').Command} Command */
/** @typedef {import('../../../foundation/bases/resolve.mjs').ActiveBase} ActiveBase */
/** @typedef {import('../../../foundation/bases/resolve.mjs').BaseResolution} BaseResolution */

/**
 * The run's base resolution when it is known without loading the resolver:
 * the resolver's answer once it has loaded; else Core, unless `--base` names
 * another package. Only a project's integrations, whose load loads the
 * resolver, and `--base` name a base other than Core.
 * @returns {BaseResolution | null} null when only the resolver can answer
 */
function knownRunBase() {
  const loaded = loadedRunBase();
  if (loaded != null) return loaded;
  const named = requestedBase();
  return named == null || named === CORE_BASE_NAME
    ? {ok: true, base: coreBase()}
    : null;
}

/**
 * The run's base resolution. The resolver loads only when it must answer.
 * @returns {Promise<BaseResolution>}
 */
export async function runResolution() {
  const known = knownRunBase();
  if (known != null) return known;
  const {runBase} = await import('../../../foundation/bases/resolve.mjs');
  return runBase();
}

/**
 * The base help and the manifest read: the run's base, or null when it does
 * not resolve. The run then fails before any work, and help lists
 * everything.
 * @returns {ActiveBase | null}
 */
export function helpBase() {
  try {
    const resolution = knownRunBase();
    return resolution?.ok ? resolution.base : null;
  } catch {
    return null;
  }
}

/**
 * Subcommands that are commands, without Commander's own `help`.
 * @param {Command} cmd
 * @returns {Command[]}
 */
function childCommands(cmd) {
  return (cmd.commands ?? []).filter(child => child.name() !== 'help');
}

/**
 * Is a command available on `base`? A command that only groups subcommands
 * is available when any of its subcommands is.
 * @param {Command} cmd
 * @param {ActiveBase | null} base
 * @returns {boolean}
 */
export function commandAvailable(cmd, base) {
  if (base == null || base.core) return true;
  return isAvailable(
    base,
    commandDocsOf(cmd)?.doc.requires,
    childCommands(cmd).map(child => commandAvailable(child, base)),
  );
}

/**
 * Is an option available on `base`?
 * @param {Command} cmd
 * @param {import('commander').Option} option
 * @param {ActiveBase | null} base
 * @returns {boolean}
 */
export function optionAvailable(cmd, option, base) {
  if (base == null || base.core) return true;
  const declared = (commandDocsOf(cmd)?.doc.options ?? []).find(
    o => longFlag(o.flag) === option.long,
  );
  return isAvailable(base, declared?.requires);
}

/**
 * A command's description as help prints it: a pointer to a command the
 * run's base does not serve is left out.
 * @param {Command} cmd
 * @returns {string}
 */
export function servedHelpDescription(cmd) {
  return servedText(cmd, served => servedDescription(cmd, served), cmd.description());
}

/**
 * An option's description as help prints it: a pointer to a command the
 * run's base does not serve is left out.
 * @param {Command} cmd the command that holds the option
 * @param {import('commander').Option} option
 * @returns {string}
 */
export function servedHelpOptionDescription(cmd, option) {
  return servedText(
    cmd,
    served => servedOptionDescription(option, served),
    option.description ?? '',
  );
}

/**
 * Text with the parts that name a command the run's base does not serve left
 * out; the whole text on Core.
 * @param {Command} cmd the command the text belongs to
 * @param {(served: (path: string) => boolean) => string} read
 * @param {string} whole
 * @returns {string}
 */
function servedText(cmd, read, whole) {
  const base = helpBase();
  if (base == null || base.core) return whole;
  /** @type {Command} */
  let root = cmd;
  while (root.parent) root = root.parent;
  return read(path => exampleAvailable(root, path, base));
}

/**
 * The subcommands of `cmd` that people and agents see, `help` aside: listed,
 * and served by the run's base. Every list a suggestion names reads this.
 * @param {{commands?: readonly any[]}} cmd
 * @returns {any[]}
 */
export function servedSubcommands(cmd) {
  const base = helpBase();
  return (cmd.commands ?? []).filter(
    c => !c._hidden && c.name() !== 'help' && commandAvailable(c, base),
  );
}

/**
 * Help settings that list only what the run's base serves. Passed to the
 * root's `configureHelp`, so every subcommand inherits them.
 * @returns {Partial<import('commander').Help>}
 */
export function baseHelpSettings() {
  return {
    commandDescription(cmd) {
      return servedHelpDescription(cmd);
    },
    subcommandDescription(cmd) {
      return cmd.summary() || servedHelpDescription(cmd);
    },
    visibleCommands(cmd) {
      const visible = Help.prototype.visibleCommands.call(this, cmd);
      const base = helpBase();
      return visible.filter(child => commandAvailable(child, base));
    },
    visibleOptions(cmd) {
      const visible = Help.prototype.visibleOptions.call(this, cmd);
      const base = helpBase();
      return visible
        .filter(option => optionAvailable(cmd, option, base))
        .map(option => {
          const shown = servedHelpOptionDescription(cmd, option);
          // Help reads the description, choices, and default from the option.
          return shown === option.description
            ? option
            : Object.assign(Object.create(option), {description: shown});
        });
    },
  };
}

/**
 * What help leaves out under one command: the commands at any depth below
 * it, and its own options.
 * @param {Command} cmd
 * @param {ActiveBase} base
 * @returns {{commands: number, options: number}}
 */
function hiddenIn(cmd, base) {
  /** @param {Command} group @returns {number} hidden commands at any depth */
  const hiddenBelow = group =>
    childCommands(group)
      .filter(child => !(/** @type {any} */ (child)._hidden))
      .reduce((total, child) => {
        const children = childCommands(child);
        if (children.length > 0) return total + hiddenBelow(child);
        return total + (commandAvailable(child, base) ? 0 : 1);
      }, 0);
  const commands = hiddenBelow(cmd);
  const options = (cmd.options ?? []).filter(
    option => !option.hidden && !optionAvailable(cmd, option, base),
  ).length;
  return {commands, options};
}

/**
 * @param {number} n
 * @param {string} noun
 * @returns {string}
 */
function count(n, noun) {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/**
 * Add the help text the base decides: a first line on a hidden command's own
 * help that names the step it needs, and a last line that counts what help
 * left out.
 * @param {Command} program
 */
export function addBaseHelpText(program) {
  program.addHelpText('beforeAll', ({command}) => {
    const base = helpBase();
    if (
      base == null ||
      command === program ||
      commandAvailable(command, base)
    ) {
      return '';
    }
    const requires = commandDocsOf(command)?.doc.requires ?? [];
    const missing = missingSteps(base, requires);
    if (missing.length === 0) {
      return `astryx ${commandPath(command)} needs steps the active base ${base.name} does not provide.\n`;
    }
    return `${refusalLine({
      command: commandPath(command),
      option: null,
      argument: null,
      requires,
      missing,
      reason: 'not-declared',
      module: null,
      base: {name: base.name, version: base.version},
    })}\n`;
  });
  program.addHelpText('afterAll', ({command}) => {
    const base = helpBase();
    if (base == null || base.core) return '';
    const hidden = hiddenIn(command, base);
    if (hidden.commands + hidden.options === 0) return '';
    const what = [
      hidden.commands > 0 ? count(hidden.commands, 'command') : null,
      hidden.options > 0 ? count(hidden.options, 'option') : null,
    ]
      .filter(Boolean)
      .join(' and ');
    return `\n${what} hidden: the active base ${base.name} does not provide the steps they need.`;
  });
}

/**
 * The long flags a run gave a command on its command line.
 * @param {Command} cmd
 * @returns {Set<string>}
 */
function givenOptions(cmd) {
  /** @type {Set<string>} */
  const given = new Set();
  for (const option of cmd.options ?? []) {
    const source = cmd.getOptionValueSource?.(option.attributeName());
    if (source === 'cli' && option.long) given.add(option.long);
  }
  return given;
}

/**
 * Refuse a run whose base resolution failed, before any work.
 * @param {{code: string, message: string}} failure
 * @param {Command} [cmd] the command that runs, for a suggestion
 * @returns {never}
 */
function refuseResolution(failure, cmd) {
  const suggestions =
    failure.code === ERROR_CODES.ERR_BASE_NOT_FOUND && cmd != null
      ? baseAsOption(cmd)
      : undefined;
  return cliError(failure.message, {code: failure.code, suggestions});
}

/**
 * The run as meant when `--base` names no installed package and the command
 * has an option whose value names an item, such as the theme editor's
 * `--like <theme>`: the same words, with the `--base` value given to that
 * option.
 * @param {Command} cmd the command that runs
 * @returns {Array<{name: string, reason: string}> | undefined}
 */
function baseAsOption(cmd) {
  const value = requestedBase();
  const option = (commandDocsOf(cmd)?.doc.options ?? []).find(o => o.names);
  if (value == null || option == null) return undefined;
  const long = longFlag(option.flag);
  if (long == null) return undefined;
  const words = process.argv.slice(2);
  const at = words.findIndex(w => w === '--base' || w.startsWith('--base='));
  if (at < 0) return undefined;
  const width = words[at] === '--base' ? 2 : 1;
  const rest = [...words.slice(0, at), ...words.slice(at + width)];
  // The option goes where --base was, unless that is before the command's
  // own words: the command reads its options after them.
  const path = commandPath(cmd).split(' ');
  let matched = 0;
  let commandEnd = 0;
  for (let i = 0; i < rest.length && matched < path.length; i += 1) {
    if (rest[i] === path[matched]) {
      matched += 1;
      commandEnd = i + 1;
    }
  }
  const after = Math.max(at, commandEnd);
  // A suggested run is printed without the output mode, as every refusal's
  // lines are.
  const meant = [...rest.slice(0, after), long, value, ...rest.slice(after)].filter(
    w => w !== '--json',
  );
  return [
    {
      name: formatCliCommand(
        ['astryx', ...meant.map(w => quoteCommandArgument(w))].join(' '),
      ),
      reason: `if ${value} is a ${option.names}, ${long} takes it`,
    },
  ];
}

/**
 * Refuse a run the base cannot serve: one line in text, the error envelope
 * with `requirement` in JSON, exit 1, nothing written.
 * @param {import('../../../foundation/bases/requirements.mjs').Requirement} requirement
 * @returns {never}
 */
function refuseRequirement(requirement) {
  const line = refusalLine(requirement);
  setOutcome('rejected', {
    exitCode: 1,
    code: ERROR_CODES.ERR_BASE_CAPABILITY,
  });
  if (isJsonMode()) {
    const {module, ...published} = requirement;
    jsonError(line, undefined, ERROR_CODES.ERR_BASE_CAPABILITY, undefined, {
      requirement: module == null ? published : {...published, module},
    });
  }
  console.error(`Error: ${line}`);
  process.exit(1);
}

/**
 * Does the command's own refusal outside a project come before the check?
 * A command that declares `refuse` refuses in a folder no project encloses,
 * and that refusal wins over every base check.
 * @param {import('@astryxdesign/cli/authoring').CommandDoc | undefined} doc
 * @param {string} cwd
 * @returns {boolean}
 */
export function refusesHereFirst(doc, cwd) {
  return doc?.outsideProject === 'refuse' && isOutsideProject(cwd);
}

/**
 * Every step the commands below a group declare.
 * @param {Command} group
 * @returns {string[]}
 */
function stepsBelow(group) {
  return childCommands(group).flatMap(child => [
    ...(commandDocsOf(child)?.doc.requires ?? []),
    ...stepsBelow(child),
  ]);
}

/** The adapters the check loaded for the running command. */
let checkedAdapters =
  /** @type {Record<string, Record<string, unknown>>} */ ({});

/**
 * The adapters of the run's base that the check loaded, by capability. A
 * command calls the active base's steps through this, never through a
 * lookup of its own.
 * @returns {Record<string, Record<string, unknown>>}
 */
export function runAdapters() {
  return checkedAdapters;
}

/**
 * The check, as a preAction hook: resolve the run's base, then check the
 * command, each given option, and each given argument value against it.
 * The first failure ends the run.
 * @param {Command} program
 * @param {Command} actionCommand
 * @returns {Promise<void>}
 */
export async function checkRun(program, actionCommand) {
  checkedAdapters = {};
  if (actionCommand === program) {
    // A bare run declares no step, but it answers from the run's base.
    const resolution = await runResolution();
    if (!resolution.ok) refuseResolution(resolution);
    return;
  }
  const doc = commandDocsOf(actionCommand)?.doc;
  if (refusesHereFirst(doc, process.cwd())) return;
  const resolution = await runResolution();
  if (!resolution.ok) refuseResolution(resolution, actionCommand);
  const base = /** @type {ActiveBase} */ (resolution.base);
  if (base.core) return;
  // A group none of whose commands the base serves is a hidden name too.
  if (!commandAvailable(actionCommand, base) && !doc?.requires?.length) {
    const requires = [
      ...new Set(stepsBelow(actionCommand).filter(step => !base.steps.includes(step))),
    ];
    refuseRequirement({
      command: commandPath(actionCommand),
      option: null,
      argument: null,
      requires,
      missing: requires,
      reason: 'not-declared',
      module: null,
      base: {name: base.name, version: base.version},
    });
  }
  const name = commandPath(actionCommand);
  const verdict = await checkRequirements(
    name,
    doc,
    {
      options: givenOptions(actionCommand),
      args: /** @type {Array<string | undefined>} */ (
        (actionCommand.processedArgs ?? actionCommand.args ?? []).map(value =>
          typeof value === 'string' ? value : undefined,
        )
      ),
    },
    base,
  );
  if (!verdict.ok) refuseRequirement(verdict.requirement);
  else checkedAdapters = verdict.adapters;
}

/**
 * The argument a positional value fills: the one at its position, else a
 * last variadic argument, which takes every value after it.
 * @param {import('@astryxdesign/cli/authoring').CommandArgDoc[]} args
 * @param {number} position
 * @returns {import('@astryxdesign/cli/authoring').CommandArgDoc | undefined}
 */
function argumentAt(args, position) {
  const last = args.at(-1);
  return args[position] ?? (last?.variadic ? last : undefined);
}

/**
 * Is an example value a placeholder in usage syntax, such as `<Name>` or
 * `[path]`, rather than a value?
 * @param {string} token
 * @returns {boolean}
 */
function isPlaceholder(token) {
  return token.startsWith('<') || token.startsWith('[');
}

/**
 * Does an example invocation name only commands, options, and argument
 * values `base` serves?
 * @param {Command} root the program
 * @param {string} cli the example, such as `astryx template --cdn`
 * @param {ActiveBase | null} base
 * @returns {boolean}
 */
export function exampleAvailable(root, cli, base) {
  if (base == null || base.core) return true;
  const tokens = cli.trim().split(/\s+/);
  if (tokens[0] === 'astryx') tokens.shift();
  let cmd = root;
  let positional = 0;
  for (const token of tokens) {
    if (token.startsWith('-')) {
      const flag = token.split('=')[0];
      const option = (cmd.options ?? []).find(
        o => o.long === flag || o.short === flag,
      );
      if (option && !optionAvailable(cmd, option, base)) return false;
      continue;
    }
    const child = childCommands(cmd).find(c => c.name() === token);
    if (child && positional === 0) {
      if (!commandAvailable(child, base)) return false;
      cmd = child;
      continue;
    }
    const arg = argumentAt(commandDocsOf(cmd)?.doc.args ?? [], positional);
    if (!isAvailable(base, arg?.requires?.[token])) return false;
    // A value of an argument that names an item names one of Core's items,
    // which this base does not have.
    if (arg?.names != null && !isPlaceholder(token)) return false;
    positional += 1;
  }
  return true;
}

setHelpExampleFilter((cmd, cli) => {
  /** @type {Command} */
  let root = cmd;
  while (root.parent) root = root.parent;
  return exampleAvailable(root, cli, helpBase());
});
