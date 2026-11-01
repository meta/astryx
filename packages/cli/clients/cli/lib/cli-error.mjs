// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Astryx CLI — central error handling helper.
 *
 * ## Exit-code policy
 *
 * The Astryx CLI follows one rule above all: **exit code is the contract**. CI
 * scripts and AI agents read it before they read any text. Every error path
 * across every command must agree on the exit code so that callers can
 * detect failure without parsing stdout/stderr.
 *
 * Specifically:
 *
 *   1. **Any user-visible error → exit 1.** This includes "command not
 *      found", "unknown subcommand", "invalid argument", "file missing",
 *      "validation failed", and every `Error: ...` line we ever print.
 *
 *   2. **"Did you mean…" suggestions are still errors.** Suggestion lists
 *      help the user recover, but the CLI still exits 1. The user asked for
 *      something we couldn't deliver.
 *
 *   3. **Help-display is success.** `xds`, `xds --help`, `xds <cmd> --help`,
 *      and `xds --version` all exit 0. The user got what they asked for.
 *
 *   4. **Empty / no-args invocations:** if the command has a sensible
 *      default (e.g. `astryx component` lists all components, `astryx docs` lists
 *      all topics), exit 0. If the command requires arguments (e.g. `xds
 *      theme build`), Commander rejects it with exit 1.
 *
 *   5. **`--json` and non-`--json` agree on exit code.** The same error case
 *      MUST exit with the same code in both modes. The shape of the message
 *      differs (envelope vs. plain text); the exit code does not.
 *
 *   6. **Prefer `process.exitCode = 1; return` over `process.exit(1)`** when
 *      the action handler is the last thing on the call stack. This lets
 *      pending I/O (stderr buffers, postAction hooks) finish cleanly. Use
 *      `process.exit(1)` only when an immediate halt is required.
 *
 * The JSON envelope shape MUST match the contract from the json.mjs module:
 *
 *   { apiVersion: 1, error: <string>, code: <string>, suggestions?: [...] }
 *
 * The `code` is a stable, machine-readable identifier (see error-codes.mjs).
 * It is the field AI agents and CI scripts should branch on — never the
 * human-readable `error` string, which changes freely. Human output stays
 * clean: the code is omitted from the printed "Error: …" line and surfaces
 * only in the JSON envelope.
 *
 * NEVER add ad-hoc fields. NEVER vary the shape. Consumers depend on it.
 */

import {isJsonMode, jsonError as _jsonError, humanWarn} from '../../../foundation/response/json.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';
import {setOutcome} from '../../../foundation/debug/index.mjs';
import {formatCliCommand} from '../../../foundation/env/package-manager.mjs';

/**
 * Suggestion object — matches the shape used by API errors and the JSON
 * envelope's `suggestions` field. Canonical definition lives in types/base.
 * @typedef {import('../../../foundation/response/base').Suggestion} Suggestion
 */

/**
 * Options for {@link cliError}.
 * @typedef {object} CliErrorOptions
 * @property {string} [code] - Stable machine-readable error code from
 *   error-codes.mjs (e.g. ERR_UNKNOWN_COMPONENT). Emitted as the `code`
 *   field of the JSON envelope. Defaults to ERR_UNKNOWN when omitted.
 *   This is the field machine consumers branch on; the human `error`
 *   string may change at any time.
 * @property {Suggestion[]} [suggestions] - Optional "did you mean…" list.
 *   Printed under the error message in human mode and serialized as the
 *   `suggestions` field in JSON mode.
 * @property {number} [exitCode] - Override the exit code. Defaults to 1.
 *   Don't set this unless you have a specific reason — every error in the
 *   CLI should exit 1.
 * @property {boolean} [hard] - When true, call `process.exit` immediately
 *   instead of setting `process.exitCode`. Default: true. We default to hard
 *   exits for commands because Commander's action handlers don't always
 *   propagate a `return` cleanly through nested awaits.
 */

/**
 * Emit a user-visible error and stop the current command.
 *
 * Routes the error through the JSON envelope when `--json` is active, or to
 * stderr otherwise. Always sets a non-zero exit code (default 1). Use this
 * in place of every ad-hoc `console.error('Error: …'); process.exit(1)`
 * pair across the CLI.
 *
 * @param {string} message - Human-readable error message. The leading
 *   "Error: " prefix is added automatically in human mode; in JSON mode the
 *   message is placed verbatim in the envelope's `error` field.
 * @param {CliErrorOptions} [options]
 * @returns {never} - Never returns; either exits the process or throws via
 *   `jsonError` (which itself exits).
 */
export function cliError(message, options = {}) {
  const {suggestions, exitCode = 1, hard = true} = options;
  const code = options.code || ERROR_CODES.ERR_UNKNOWN;

  // Record before either branch below exits. This is the single most important
  // instrumentation point in the CLI: `hard` defaults to true, so both paths
  // end in `process.exit` and nothing downstream — no `finally`, no postAction
  // hook — gets another chance to classify the failure.
  setOutcome('error', {exitCode, error: new Error(message), code});

  if (isJsonMode()) {
    // jsonError emits the envelope on stdout and calls process.exit(1).
    // We don't honor a custom exitCode in JSON mode — the contract is exit 1.
    // The stable `code` is carried into the envelope; the human-facing
    // branch below intentionally omits it to keep stderr clean.
    _jsonError(message, suggestions, code);
    // Unreachable, but keeps the type-checker honest.
    return /** @type {never} */ (undefined);
  }

  // Human mode: prefix "Error:" and print suggestions on subsequent lines.
  // Use console.error directly — we always want stderr for errors regardless
  // of the JSON-mode flag (we already handled JSON above).
  console.error(`Error: ${message}`);
  if (suggestions?.length) {
    console.error('');
    for (const s of suggestions) {
      // A suggested command stays bare in JSON and is prefixed here.
      const name = /^astryx(\s|$)/.test(s.name) ? formatCliCommand(s.name) : s.name;
      const tag = s.reason ? `  ${name}  (${s.reason})` : `  ${name}`;
      console.error(tag);
    }
  }

  if (hard) {
    process.exit(exitCode);
  } else {
    process.exitCode = exitCode;
  }
  return /** @type {never} */ (undefined);
}

/**
 * Reject a positional argument the user typed as `""`.
 *
 * @param {string} name the argument as the help spells it, without brackets
 * @param {unknown} value what Commander passed
 * @param {string} command the command as a user types it, e.g. `astryx template`
 * @returns {void} returns only when the argument is not an empty string
 */
export function rejectEmptyArgument(name, value, command) {
  if (typeof value !== 'string' || value.length > 0) return;
  cliError(
    `Argument <${name}> is an empty string. ` +
      'An empty argument is not the same as an omitted one, and ignoring it ' +
      'would silently discard the rest of the command: pass a value, or leave ' +
      `<${name}> out of \`${command}\` entirely.`,
    {code: ERROR_CODES.ERR_INVALID_ARGUMENT},
  );
}

/**
 * Clean exit. Mostly a marker for intent — `process.exit(0)` works fine,
 * but using cliExit at success boundaries makes greps for "exit policy"
 * sites unambiguous.
 * @param {number} [code]
 * @returns {never}
 */
export function cliExit(code = 0) {
  process.exit(code);
}

/**
 * Assert a condition; on failure, emit a CLI error.
 *
 * Convenience wrapper for the common pattern:
 *
 *   if (!something) { cliError('something is required'); }
 *
 * @param {unknown} condition - Truthy → no-op. Falsy → cliError.
 * @param {string} message
 * @param {CliErrorOptions} [options]
 * @returns {asserts condition}
 */
export function assertOrExit(condition, message, options) {
  if (!condition) {
    cliError(message, options);
  }
}

// Re-export humanWarn for callers that want a non-fatal warning channel.
// Warnings should NOT change the exit code.
export {humanWarn};
