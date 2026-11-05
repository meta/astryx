// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The CommandDoc -> Commander converter. One place turns a typed
 * `CommandDoc` (+ the FunctionDoc it wraps, for inherited param descriptions)
 * into a configured Commander command, so `--help` and the manifest can be
 * sourced from the same colocated docs that feed `astryx docs` and the docsite.
 *
 * The CommandDoc type lives in `@astryxdesign/cli/authoring` with no Commander
 * dependency; this converter is the CLI-side adapter. Only the metadata is
 * generic — each command still supplies its own action (the thin wrapper that
 * calls the api function and renders).
 *
 * It is also where a run's RESULT is recorded. Every command that ships passes
 * through here, so an action returns a {@link CommandResult} and this converter
 * stamps it onto the run's debug event — one place, for all of them. That is
 * deliberate: reporting used to be a call each command made on its way out, and
 * a command that forgot simply reported nothing. Now the return type asks the
 * question at authoring time and the converter answers it at runtime, so a new
 * command is logged correctly without doing anything at all.
 *
 * @input a CommandDoc (+ optional FunctionDoc) + an action returning a result
 * @output a configured commander Command added to the given parent
 * @position packages/cli/clients/cli/lib — CLI command converter
 */

import {recordCommandResult} from '../../../foundation/debug/index.mjs';
import {routeSegment} from '../../../foundation/discovery/docs-section-key.mjs';
import {formatCliCommand} from '../../../foundation/env/package-manager.mjs';
import {renderTokens} from '../../../foundation/doc-compiler/links.mjs';
import {text} from '../formatters/index.mjs';

/**
 * Marks a Commander command that reports what it answered with, and says HOW:
 * `converter` for the contract path below (the action's return type), `manual`
 * for the few hand-registered commands that record for themselves.
 *
 * Read by the coverage test that walks the assembled program, so a command
 * registered by hand — bypassing the contract — is caught in CI rather than
 * discovered as a column of nulls months later. The two values are what let
 * that test PIN the hand-registered set instead of trusting the mark.
 */
export const REPORTS_RESULT = Symbol.for('astryx.command.reportsResult');

/**
 * Does this command report what it answered with?
 * @param {import('commander').Command} cmd
 * @returns {boolean}
 */
export function reportsResult(cmd) {
  return reportsResultVia(cmd) !== null;
}

/**
 * How this command reports, or null if it does not.
 * @param {import('commander').Command} cmd
 * @returns {'converter' | 'manual' | null}
 */
export function reportsResultVia(cmd) {
  const via = /** @type {any} */ (cmd)?.[REPORTS_RESULT];
  return via === 'converter' || via === 'manual' ? via : null;
}

/**
 * Mark a hand-registered command as reporting its result.
 *
 * For what does not come from a CommandDoc: the root program, and the stub
 * left behind when a command module fails to load. Every command, `manifest`
 * and the hidden `postinstall` hook included, registers through
 * {@link defineCommand}. These call {@link recordCommandResult} themselves; this
 * says so, and the coverage test pins the set of commands allowed to, so the
 * mark cannot become a quiet way around the contract.
 *
 * @param {import('commander').Command} cmd
 * @returns {import('commander').Command} the same command, for chaining.
 */
export function markReportsResult(cmd) {
  Object.defineProperty(cmd, REPORTS_RESULT, {
    value: 'manual',
    configurable: true,
  });
  return cmd;
}

/** The CommandDoc and wrapped FunctionDoc a command was built from. */
export const COMMAND_DOCS = Symbol.for('astryx.command.docs');

/**
 * The docs a command was built from; undefined for a hand-registered command.
 * @param {import('commander').Command} cmd
 * @returns {{
 *   doc: import('@astryxdesign/cli/authoring').CommandDoc,
 *   fn?: import('@astryxdesign/cli/authoring').FunctionDoc,
 * } | undefined}
 */
export function commandDocsOf(cmd) {
  return /** @type {any} */ (cmd)?.[COMMAND_DOCS];
}

/**
 * Build a Commander command from a CommandDoc and attach it to `parent`.
 *
 * @param {import('commander').Command} parent - program or a group command.
 * @param {import('@astryxdesign/cli/authoring').CommandDoc} doc
 * @param {{
 *   fn?: import('@astryxdesign/cli/authoring').FunctionDoc,
 *   action?: (...args: any[]) => import('../../../foundation/debug/command-result.mjs').CommandResult
 *     | Promise<import('../../../foundation/debug/command-result.mjs').CommandResult>,
 *   hidden?: boolean,
 * }} [impl] `hidden` keeps the command out of help and the manifest (a
 *   package-script hook, not a command for people or agents).
 * @returns {import('commander').Command} the created command.
 */
export function defineCommand(parent, doc, {fn, action, hidden} = {}) {
  // The command token is the last path segment ("theme build" -> "build"),
  // since subcommands are added to their group command, not the program.
  const token = doc.name.split(' ').pop() ?? doc.name;
  const argSpec = (doc.args ?? [])
    .map(a => {
      const inner = a.variadic ? `${a.name}...` : a.name;
      return a.required ? `<${inner}>` : `[${inner}]`;
    })
    .join(' ');

  const cmd = parent.command(
    argSpec ? `${token} ${argSpec}` : token,
    hidden ? {hidden: true} : {},
  );
  Object.defineProperty(cmd, COMMAND_DOCS, {value: {doc, fn}, configurable: true});
  // Help shows doc tokens as commands, the way `astryx docs` does.
  if (doc.summary) cmd.description(renderTokens(doc.summary));
  // An experimental command says so wherever its name is listed in help.
  if (doc.stability === 'experimental') {
    cmd.description(`[experimental] ${cmd.description() || ''}`.trimEnd());
  }
  if (doc.deprecated) {
    const base = cmd.description() || '';
    cmd.description(`${base} [DEPRECATED: ${doc.deprecated}]`);
  }

  const paramDesc = (/** @type {string | undefined} */ name) =>
    (fn?.params ?? []).find(p => p.name === name)?.description ?? '';

  for (const arg of doc.args ?? []) {
    // Only set an arg description when the doc gives one explicitly. Commander
    // renders an "Arguments:" help section only for described args; inheriting
    // the FunctionDoc param description here would add that section where the
    // current CLI has none. (Docsite/`astryx docs` read the arg's `param` for
    // its description instead.)
    if (arg.description) {
      const argument = cmd.registeredArguments?.find(a => a.name() === arg.name);
      if (argument) argument.description = renderTokens(arg.description);
    }
  }

  for (const o of doc.options ?? []) {
    const desc = o.description ?? (o.param ? paramDesc(o.param) : '');
    const option = cmd.createOption(o.flag, renderTokens(desc));
    if (o.default != null) option.default(o.default);
    cmd.addOption(option);
  }

  // Help ends with the documented exit codes, the examples, and the docs
  // route that reads the whole command. `choices` stay in the option text:
  // Commander `.choices()` would replace the api layer's ERR_INVALID_ARGUMENT
  // validation.
  addDocHelp(cmd, doc);

  if (action) {
    // The recording seam. An action's job ends at "here is what I answered
    // with"; getting that onto the event is this converter's job, and doing it
    // here means every command is covered by construction — including the ones
    // written next month.
    cmd.action(async (/** @type {any[]} */ ...args) => {
      const result = await action(...args);
      recordCommandResult(result);
    });
    Object.defineProperty(cmd, REPORTS_RESULT, {
      value: 'converter',
      configurable: true,
    });
  }
  return cmd;
}

/**
 * End `cmd`'s help with what its CommandDoc says: the exit codes, then the
 * examples, then `More:`, the `astryx docs` route that reads the whole command.
 * @param {import('commander').Command} cmd
 * @param {import('@astryxdesign/cli/authoring').CommandDoc} doc
 */
export function addDocHelp(cmd, doc) {
  addExitCodesHelp(cmd, doc.exitCodes);
  // Rendered when help is shown, so the run prefix (pnpm exec astryx, yarn
  // astryx, ...) is looked up then, not on every start.
  cmd.addHelpText('after', () => {
    const examples = (doc.examples ?? []).flatMap(({label, cli}) => [
      ...(label ? [`  # ${label}`] : []),
      `  ${formatCliCommand(cli)}`,
    ]);
    const more = `More: ${formatCliCommand(`docs cli/commands/${routeSegment(doc.name)}`)}`;
    const blocks = examples.length > 0 ? [['Examples:', ...examples].join('\n'), more] : [more];
    return `\n${text(blocks.join('\n\n')).toString()}`;
  });
}

/**
 * End `cmd`'s help with a CommandDoc's exit codes.
 * @param {import('commander').Command} cmd
 * @param {import('@astryxdesign/cli/authoring').CommandDoc['exitCodes']} exitCodes
 */
export function addExitCodesHelp(cmd, exitCodes) {
  if (!exitCodes?.length) return;
  const lines = exitCodes.map(({code, when}) => `  ${code}  ${when}`);
  cmd.addHelpText('after', `\n${text(['Exit codes:', ...lines].join('\n')).toString()}`);
}
