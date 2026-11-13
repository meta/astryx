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
import {runBase} from '../../../foundation/bases/resolve.mjs';
import {
  checkRequirements,
  longFlag,
  missingSteps,
  refusalLine,
} from '../../../foundation/bases/requirements.mjs';
import {isJsonMode, jsonError} from '../../../foundation/response/json.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';
import {setOutcome} from '../../../foundation/debug/index.mjs';
import {cliError} from './cli-error.mjs';
import {isOutsideProject} from '../../../foundation/env/project-scope.mjs';
import {commandDocsOf, setHelpExampleFilter} from './define-command.mjs';

/** @typedef {import('commander').Command} Command */
/** @typedef {import('../../../foundation/bases/resolve.mjs').ActiveBase} ActiveBase */

/**
 * The base help and the manifest read: the run's base, or null when it does
 * not resolve. The run then fails before any work, and help lists
 * everything.
 * @returns {ActiveBase | null}
 */
export function helpBase() {
  try {
    const resolution = runBase();
    return resolution.ok ? resolution.base : null;
  } catch {
    return null;
  }
}

/**
 * The full command path after `astryx`, such as `theme build`.
 * @param {Command} cmd
 * @returns {string}
 */
export function commandPath(cmd) {
  const parts = [];
  /** @type {Command | null} */
  let c = cmd;
  while (c && c.parent) {
    parts.unshift(c.name());
    c = c.parent;
  }
  return parts.join(' ');
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
  const requires = commandDocsOf(cmd)?.doc.requires;
  const children = childCommands(cmd);
  if (children.length > 0 && !requires?.length) {
    return children.some(child => commandAvailable(child, base));
  }
  return missingSteps(base, requires).length === 0;
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
  return missingSteps(base, declared?.requires).length === 0;
}

/**
 * Help settings that list only what the run's base serves. Passed to the
 * root's `configureHelp`, so every subcommand inherits them.
 * @returns {Partial<import('commander').Help>}
 */
export function baseHelpSettings() {
  return {
    visibleCommands(cmd) {
      const visible = Help.prototype.visibleCommands.call(this, cmd);
      const base = helpBase();
      return visible.filter(child => commandAvailable(child, base));
    },
    visibleOptions(cmd) {
      const visible = Help.prototype.visibleOptions.call(this, cmd);
      const base = helpBase();
      return visible.filter(option => optionAvailable(cmd, option, base));
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
 * @returns {never}
 */
function refuseResolution(failure) {
  return cliError(failure.message, {code: failure.code});
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
  if (actionCommand === program) return;
  const doc = commandDocsOf(actionCommand)?.doc;
  if (refusesHereFirst(doc, process.cwd())) return;
  const resolution = runBase();
  if (!resolution.ok) refuseResolution(resolution);
  const base = /** @type {ActiveBase} */ (resolution.base);
  if (base.core) return;
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
    const arg = commandDocsOf(cmd)?.doc.args?.[positional];
    if (missingSteps(base, arg?.requires?.[token]).length > 0) return false;
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
