// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The one requirement check: does the run's base serve every step the
 * command, and each option or argument value given to it, declares?
 * @input a command's CommandDoc, the values the run gave it, and the base
 * @output availability for help and the manifest, and the check's verdict
 *   with the loaded adapters
 * @position foundation/bases — the CLI runs the check once, before any
 *   command body; no command checks its own requirement
 */

import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
import {callsStep, capabilityOf, exportOf} from './steps.mjs';

/**
 * The steps in `steps` that a base does not serve to `command`, as help and
 * the manifest read them. A base other than Core serves a step only to a
 * command that calls it. Help never loads an adapter.
 * @param {import('./resolve.mjs').ActiveBase} base
 * @param {readonly string[] | undefined} steps
 * @param {string} command the command path, such as `theme build`
 * @returns {string[]} the steps it does not serve
 */
export function missingSteps(base, steps, command) {
  return (steps ?? []).filter(
    step =>
      !base.steps.includes(step) || (!base.core && !callsStep(command, step)),
  );
}

/**
 * Is a command, option, or argument value available on `base`, as help and
 * the manifest show it? A command that only groups subcommands and declares
 * no step of its own is available when any of its subcommands is.
 * @param {import('./resolve.mjs').ActiveBase} base
 * @param {readonly string[] | undefined} requires the steps it declares
 * @param {string} command the command path, such as `theme build`; for an
 *   option or argument value, the command it belongs to
 * @param {readonly boolean[]} [subcommands] whether each subcommand is
 *   available, for a command that groups subcommands
 * @returns {boolean}
 */
export function isAvailable(base, requires, command, subcommands = []) {
  if (subcommands.length > 0 && !requires?.length) {
    return subcommands.some(Boolean);
  }
  return missingSteps(base, requires, command).length === 0;
}

/**
 * What a refused run needs.
 * @typedef {object} Requirement
 * @property {string} command the command as a user types it after `astryx`
 * @property {string | null} option the option's long flag, when an option
 *   declares the step
 * @property {{name: string, value: string} | null} argument the argument
 *   and value, when an argument value declares the step
 * @property {string[]} requires every step that part declares
 * @property {string[]} missing the steps the base does not serve
 * @property {'not-declared' | 'failed-to-load' | 'not-exported'} reason
 * @property {string | null} module the adapter module that failed to load,
 *   or that does not export a step the base lists
 * @property {{name: string, version: string | null}} base
 */

/**
 * The parts of a run that declare steps, in check order: the command, then
 * each given option, then each given argument value.
 * @param {string} command
 * @param {import('../../authoring/doctypes/command/type').CommandDoc} doc
 * @param {{options: Set<string>, args: Array<string | undefined>}} given the
 *   long flags the run gave, and its positional values in declared order
 * @returns {Array<{option: string | null, argument: {name: string, value: string} | null, requires: string[]}>}
 */
export function declaredParts(command, doc, given) {
  const parts = [];
  if (doc.requires?.length) {
    parts.push({option: null, argument: null, requires: [...doc.requires]});
  }
  for (const option of doc.options ?? []) {
    if (!option.requires?.length) continue;
    const long = longFlag(option.flag);
    if (long && given.options.has(long)) {
      parts.push({option: long, argument: null, requires: [...option.requires]});
    }
  }
  (doc.args ?? []).forEach((arg, i) => {
    const value = given.args[i];
    const steps = value == null ? undefined : arg.requires?.[value];
    if (steps?.length) {
      parts.push({option: null, argument: {name: arg.name, value}, requires: [...steps]});
    }
  });
  return parts;
}

/**
 * The long form of a Commander flag spec, such as `--skeleton` from
 * `-s, --skeleton`.
 * @param {string} flag
 * @returns {string | null}
 */
export function longFlag(flag) {
  return flag.match(/--[a-z0-9-]+/i)?.[0] ?? null;
}

/**
 * Run the check for one command run. A step passes when the base serves it,
 * declares its capability's adapter, the module loads, and it exports the step.
 * A function the module exports for a step the base does not list is never
 * handed over.
 * Core's steps are the CLI's own, so Core passes every step with no load.
 * @param {string} command
 * @param {import('../../authoring/doctypes/command/type').CommandDoc | undefined} doc
 * @param {{options: Set<string>, args: Array<string | undefined>}} given
 * @param {import('./resolve.mjs').ActiveBase} base
 * @returns {Promise<{ok: true, adapters: Record<string, Record<string, unknown>>} | {ok: false, requirement: Requirement}>}
 */
export async function checkRequirements(command, doc, given, base) {
  /** @type {Record<string, Record<string, unknown>>} */
  const adapters = {};
  if (doc == null || base.core) return {ok: true, adapters};
  for (const part of declaredParts(command, doc, given)) {
    /** @type {string[]} */
    const missing = [];
    /** @type {string | null} */
    let failedModule = null;
    /** @type {string | null} */
    let unexportedModule = null;
    for (const step of part.requires) {
      const capability = capabilityOf(step);
      const file = base.adapters[capability];
      if (
        missingSteps(base, [step], command).length > 0 ||
        file == null ||
        base.dir == null
      ) {
        missing.push(step);
        continue;
      }
      if (!(capability in adapters)) {
        try {
          adapters[capability] = await loadAdapter(base.dir, file);
        } catch {
          failedModule = file;
          missing.push(step);
          continue;
        }
      }
      if (typeof adapters[capability][exportOf(step)] !== 'function') {
        // The base lists the step, so the module is wrong, not the base's
        // declaration: name the module.
        unexportedModule = file;
        missing.push(step);
      }
    }
    if (missing.length > 0) {
      return {
        ok: false,
        requirement: {
          command,
          option: part.option,
          argument: part.argument,
          requires: part.requires,
          missing,
          reason: failedModule
            ? 'failed-to-load'
            : unexportedModule
              ? 'not-exported'
              : 'not-declared',
          module: failedModule ?? unexportedModule,
          base: {name: base.name, version: base.version},
        },
      };
    }
  }
  return {ok: true, adapters};
}

/**
 * Import an adapter module from inside its base package.
 * @param {string} dir the base package folder
 * @param {string} file the module path the base declares
 * @returns {Promise<Record<string, unknown>>}
 */
async function loadAdapter(dir, file) {
  const resolved = path.resolve(dir, file);
  const rel = path.relative(dir, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`${file} is outside the base package`);
  }
  return /** @type {Record<string, unknown>} */ (
    await import(pathToFileURL(resolved).href)
  );
}

/**
 * The one line a refused run prints.
 * @param {Requirement} requirement
 * @returns {string}
 */
export function refusalLine(requirement) {
  const part = requirement.option
    ? `astryx ${requirement.command} ${requirement.option}`
    : requirement.argument
      ? `astryx ${requirement.command} ${requirement.argument.value}`
      : `astryx ${requirement.command}`;
  const steps = requirement.missing.join(', ');
  const noun = requirement.missing.length === 1 ? 'step' : 'steps';
  if (requirement.reason === 'not-exported') {
    const it = requirement.missing.length === 1 ? 'it' : 'them';
    return `${part} needs the ${steps} ${noun}; the active base ${requirement.base.name} lists ${it} but ${requirement.module} does not export ${it}.`;
  }
  if (requirement.reason === 'failed-to-load') {
    return `${part} needs the ${steps} ${noun}; the active base ${requirement.base.name} declares it in ${requirement.module}, which does not load.`;
  }
  return `${part} needs the ${steps} ${noun}; the active base ${requirement.base.name} does not provide ${requirement.missing.length === 1 ? 'it' : 'them'}.`;
}
