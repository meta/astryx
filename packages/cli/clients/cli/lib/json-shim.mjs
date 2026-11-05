// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Commander shim that extends the --json contract to cover
 * Commander's parse-time short-circuits (parse errors, unknown options,
 * --help display, unknown subcommands).
 *
 * Background: PR #2467 set up the --json envelope and a `preAction` gate.
 * That works for the normal command-execution path, but Commander's own
 * error and help paths run BEFORE preAction:
 *
 *   - Missing required argument / unknown option → `_displayError`
 *     writes "error: ..." to stderr and calls `_exit(1)` synchronously.
 *   - `--help` → `outputHelp()` writes raw "Usage:" text to stdout
 *     and calls `_exit(0)`.
 *
 * Neither path emits the JSON envelope, and neither throws (so the
 * try/catch in `bin/astryx.mjs` never sees them). The result: a --json
 * consumer receives empty stdout + raw stderr, breaking the contract.
 *
 * The shim closes the gap by:
 *   1. Calling `exitOverride()` so Commander throws CommanderError
 *      instead of calling `process.exit` synchronously.
 *   2. Routing those errors through a single handler that emits a
 *      JSON error envelope when --json is in argv.
 *   3. Overriding each command's `outputHelp` so --help emits a
 *      structured JSON help envelope (instead of raw text) when
 *      --json is set.
 *   4. Routing unknown-subcommand attempts through the same error
 *      envelope path (so `astryx bogus-cmd --json` gets exit 1 + envelope
 *      instead of exit 0 + help envelope).
 *   5. Emitting an error envelope, not the help envelope, when Commander
 *      shows help because the invocation failed (`help <unknown>`, or a
 *      command group with no subcommand), which exits 1.
 *
 * Commander writes its own "error: ..." line via configureOutput.writeErr.
 * The shim drops that line in both modes. Under --json the error envelope
 * replaces it; in text mode `handleCommanderError` writes the Astryx line
 * instead (`Error: <message>`, the same message the envelope carries), so
 * a parse failure reads like every other CLI error. Other stderr output,
 * such as help printed as the failure report, still passes through.
 */

import {API_VERSION, isJsonMode, toErrorEnvelope} from '../../../foundation/response/json.mjs';
import {answeredBy} from '../../../foundation/release/run-context.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';
import {setCommand, setOutcome, recordHelp} from '../../../foundation/debug/index.mjs';

/**
 * Fully-qualified name of a command relative to the root program, e.g.
 * `theme build`. The root itself is ''.
 * @param {import('commander').Command} cmd
 * @returns {string}
 */
function fullNameOf(cmd) {
  /** @type {string[]} */
  const parts = [];
  /** @type {any} */
  let node = cmd;
  while (node?.parent) {
    parts.unshift(node.name());
    node = node.parent;
  }
  return parts.join(' ');
}

/**
 * Cheap argv check used before preAction has had a chance to engage
 * `setJsonMode`. We can't rely on `program.opts().json` here because
 * Commander throws during parse — opts may not be populated yet.
 * @returns {boolean}
 */
function argvHasJson() {
  return process.argv.slice(2).includes('--json');
}

/** @returns {boolean} */
function jsonActive() {
  return isJsonMode() || argvHasJson();
}

/**
 * Build a structured JSON help envelope for a given Commander command.
 * Mirrors the existing root help envelope shape, but works for any
 * subcommand (e.g. `astryx component --help --json`).
 *
 * @param {import('commander').Command} cmd
 * @returns {{apiVersion: number, type: 'help', data: object, meta: {answeredBy: {cli: string, core: string | null, copy: 'project' | 'starting' | 'matched' | 'carried' | 'fallback'}}}}
 */
export function buildHelpEnvelope(cmd) {
  // Reconstruct the fully-qualified command name (e.g. "astryx theme build").
  const nameParts = [];
  /** @type {import('commander').Command | null} */
  let c = cmd;
  while (c) {
    nameParts.unshift(c.name());
    c = c.parent;
  }

  /** @type {Array<{flags: string, description: string, defaultValue?: unknown, choices?: string[]}>} */
  const options = cmd.options.map((o) => {
    /** @type {any} */
    const opt = {flags: o.flags, description: o.description || ''};
    if (o.defaultValue !== undefined) opt.defaultValue = o.defaultValue;
    if (Array.isArray(o.argChoices) && o.argChoices.length) opt.choices = o.argChoices;
    return opt;
  });

  const subcommands = cmd.commands
    .filter((s) => !(/** @type {any} */ (s))._hidden)
    .map((s) => ({name: s.name(), description: s.description() || ''}));

  return {
    apiVersion: API_VERSION,
    type: 'help',
    data: {
      command: nameParts.join(' '),
      description: cmd.description() || '',
      usage: `${nameParts.join(' ')} ${cmd.usage()}`.trim(),
      options,
      subcommands,
    },
    meta: {answeredBy: answeredBy()},
  };
}

/**
 * The error envelope for help Commander shows because the invocation failed
 * (it then exits 1): `help <name>` for an unknown name on the root, or a
 * command group run without a subcommand.
 *
 * @param {import('commander').Command} cmd the command whose help was shown
 * @returns {ReturnType<typeof toErrorEnvelope>}
 */
export function buildHelpErrorEnvelope(cmd) {
  const available = cmd.commands
    .filter(s => !(/** @type {any} */ (s))._hidden && s.name() !== 'help')
    .map(s => s.name());
  if (!cmd.parent) {
    // Commander dispatches `help <name>` with ['help', <name>, ...] in args.
    const requested = cmd.args[1];
    return toErrorEnvelope(
      requested ? `unknown command '${requested}'` : 'unknown command',
      available.map(name => ({name, reason: 'available command'})),
      ERROR_CODES.ERR_UNKNOWN_COMMAND,
    );
  }
  const group = fullNameOf(cmd);
  return toErrorEnvelope(
    `'${group}' needs a subcommand`,
    available.map(name => ({name: `${group} ${name}`, reason: 'available subcommand'})),
    ERROR_CODES.ERR_MISSING_ARGUMENT,
  );
}

/**
 * Emit a JSON error envelope to stdout (the JSON contract uses stdout
 * for both success and error).
 *
 * @param {string} message
 * @param {import('../../../foundation/response/base').Suggestion[]} [suggestions]
 * @param {string} [code] - Stable machine-readable error code (error-codes.mjs).
 */
function emitJsonError(message, suggestions, code) {
  if (process.__xdsJsonHandled) return;
  process.__xdsJsonHandled = true;
  const env = toErrorEnvelope(message, suggestions, code);
  process.stdout.write(`${JSON.stringify(env, null, 2)}\n`);
}

/**
 * Map a Commander parse-error code (and its message) to a stable Astryx error
 * code. Commander's own codes are stable enough, but they aren't part of our
 * documented contract — so we translate them into the `ERR_*` taxonomy.
 *
 * The `--lang` / `--detail` choice violations both arrive as
 * `commander.invalidArgument`; we disambiguate on the option name in the
 * message so consumers get the precise ERR_INVALID_LANG / ERR_INVALID_DETAIL.
 *
 * @param {string} commanderCode - e.g. 'commander.unknownOption'
 * @param {string} message
 * @returns {string}
 */
function commanderCodeToErrorCode(commanderCode, message) {
  switch (commanderCode) {
    case 'commander.unknownCommand':
      return ERROR_CODES.ERR_UNKNOWN_COMMAND;
    case 'commander.unknownOption':
      return ERROR_CODES.ERR_INVALID_OPTION;
    case 'commander.missingArgument':
    case 'commander.missingMandatoryOptionValue':
      return ERROR_CODES.ERR_MISSING_ARGUMENT;
    case 'commander.excessArguments':
      return ERROR_CODES.ERR_INVALID_ARGUMENT;
    case 'commander.invalidArgument':
    case 'commander.invalidOptionArgument': {
      if (/--lang\b/.test(message)) return ERROR_CODES.ERR_INVALID_LANG;
      if (/--detail\b/.test(message)) return ERROR_CODES.ERR_INVALID_DETAIL;
      return ERROR_CODES.ERR_INVALID_ARGUMENT;
    }
    default:
      return ERROR_CODES.ERR_UNKNOWN;
  }
}

/**
 * Install the shim on a Commander program. Idempotent — safe to call
 * once at program-construction time.
 *
 * @param {import('commander').Command} program
 */
export function installJsonShim(program) {
  // exitOverride() and configureOutput() do NOT auto-cascade to
  // subcommands that were registered BEFORE the shim runs (Commander
  // copies these settings from parent at command-creation time, not
  // at parse time). So we walk the whole tree and apply them
  // explicitly to every node.
  applyShimRecursively(program);

  // Don't tack the help text onto error output. We render help
  // ourselves (or as JSON) and don't want Commander's stderr help dump
  // interleaving with our error envelope.
  program.showHelpAfterError(false);

  // Patch outputHelp on every command (root + subcommands) so
  // `--help` emits a JSON envelope when --json is active. Commander
  // creates subcommands lazily, so wrap recursively + patch any
  // new ones added later by walking after registration.
  patchHelpRecursively(program);
}

/**
 * Apply exitOverride and JSON-aware configureOutput to a command and
 * all of its descendants. We do this recursively because Commander
 * only copies these settings to children created AFTER the parent is
 * configured — and our subcommands were already registered by the
 * time installJsonShim runs.
 *
 * @param {import('commander').Command} cmd
 */
function applyShimRecursively(cmd) {
  // The exitOverride callback is the only place that knows WHICH command
  // Commander rejected. Parse errors happen before any preAction hook runs,
  // so without this every `astryx theme build` (missing argument) would be
  // recorded against the root program instead of `theme build`.
  cmd.exitOverride(err => {
    try {
      setCommand(fullNameOf(cmd));
    } catch {
      // Never let recording interfere with the error path.
    }
    throw err;
  });
  cmd.configureOutput({
    writeOut: (str) => process.stdout.write(str),
    // Commander's own "error: ..." line never reaches the user. Under --json a
    // consumer parsing both streams must not see it alongside the envelope;
    // in text mode it is Commander's format, not Astryx's, so an invalid
    // global option (`--lang zh-Hans`) printed `error: option '--lang
    // <locale>' argument 'zh-Hans' is invalid…` where every other CLI error
    // prints `Error: …`. handleCommanderError writes the Astryx line below,
    // for both modes, from the same message.
    //
    // ONLY that line. Commander also writes HELP through this channel when it
    // shows help because the invocation failed (a command group with no
    // subcommand), and that output is still wanted in text mode.
    writeErr: (str) => {
      if (jsonActive()) return;
      if (/^error:\s/i.test(str)) return;
      process.stderr.write(str);
    },
  });
  makeSelfInstalling(cmd);
  for (const sub of cmd.commands) {
    applyShimRecursively(sub);
  }
}

/** Marks a command whose `command`/`addCommand` already self-install the shim. */
const SELF_INSTALLING = Symbol.for('astryx.jsonShim.selfInstalling');

/**
 * Make a shimmed command shim anything attached to it later.
 *
 * A one-time recursive walk is order-dependent: it only covers commands that
 * exist when `installJsonShim` runs, so anything registered afterwards keeps
 * Commander's default `_exit` and silently drops out of the --json contract
 * AND out of parse-error attribution. Wrapping the two registration methods
 * removes the ordering requirement entirely — a command is shimmed the moment
 * it joins the tree, whenever that happens and at whatever depth.
 *
 * @param {import('commander').Command} cmd
 */
function makeSelfInstalling(cmd) {
  const node = /** @type {any} */ (cmd);
  if (node[SELF_INSTALLING]) return;
  node[SELF_INSTALLING] = true;

  const originalCommand = node.command.bind(node);
  const originalAddCommand = node.addCommand.bind(node);

  /** @param {...any} args */
  node.command = (...args) => {
    const created = originalCommand(...args);
    // The `.command(name, description)` executable form returns `this`, not a
    // new command — only recurse when we actually got a child back.
    if (created && created !== node) applyShimRecursively(created);
    return created;
  };

  /** @param {any} sub @param {any} [opts] */
  node.addCommand = (sub, opts) => {
    const result = originalAddCommand(sub, opts);
    if (sub) applyShimRecursively(sub);
    return result;
  };
}

/**
 * Walk the command tree and override outputHelp on every command so that
 * `--help --json` emits a structured help envelope instead of raw text.
 *
 * @param {import('commander').Command} cmd
 */
function patchHelpRecursively(cmd) {
  patchOutputHelp(cmd);
  for (const sub of cmd.commands) {
    patchHelpRecursively(sub);
  }
  // If new subcommands are added later (via commands.push or
  // .command(...)), patch them on first .help()/--help. Commander
  // doesn't fire an event for command registration, so we hook into
  // Command.prototype here (one-time, idempotent).
  if (!Command_outputHelp_patched) {
    patchPrototype(cmd.constructor);
    Command_outputHelp_patched = true;
  }
}

let Command_outputHelp_patched = false;

/**
 * Replace outputHelp on a single Command instance.
 * @param {import('commander').Command} cmd
 */
function patchOutputHelp(cmd) {
  // Commander instances are monkeypatched at runtime with an internal
  // `__xdsHelpPatched` marker and a replacement `outputHelp`, neither of which
  // is in commander's public types — treat the instance as untyped here.
  const anyCmd = /** @type {any} */ (cmd);
  if (anyCmd.__xdsHelpPatched) return;
  anyCmd.__xdsHelpPatched = true;
  const original = cmd.outputHelp.bind(cmd);
  anyCmd.outputHelp = function patchedOutputHelp(/** @type {any} */ contextOptions) {
    if (jsonActive()) {
      if (!process.__xdsJsonHandled) {
        process.__xdsJsonHandled = true;
        const env = contextOptions?.error
          ? buildHelpErrorEnvelope(cmd)
          : buildHelpEnvelope(cmd);
        process.stdout.write(`${JSON.stringify(env, null, 2)}\n`);
      }
      return;
    }
    return original(contextOptions);
  };
}

/**
 * Patch Command.prototype so that any subcommand created after install
 * also gets the JSON help override. Belt-and-suspenders for late-bound
 * commands.
 * @param {Function} CommandCtor
 */
function patchPrototype(CommandCtor) {
  const proto = CommandCtor.prototype;
  if (proto.__xdsHelpPatched) return;
  proto.__xdsHelpPatched = true;
  const original = proto.outputHelp;
  proto.outputHelp = function patchedProtoOutputHelp(/** @type {any} */ contextOptions) {
    if (jsonActive()) {
      if (!process.__xdsJsonHandled) {
        process.__xdsJsonHandled = true;
        const env = contextOptions?.error
          ? buildHelpErrorEnvelope(this)
          : buildHelpEnvelope(this);
        process.stdout.write(`${JSON.stringify(env, null, 2)}\n`);
      }
      return;
    }
    return original.call(this, contextOptions);
  };
}

/**
 * Convert a CommanderError thrown during parse into either a JSON
 * envelope (under --json) or the legacy stderr behavior, then exit
 * with the right code.
 *
 * Codes we care about (Commander 14):
 *   commander.helpDisplayed       — `--help` was used (exit 0)
 *   commander.help                — same family (exit 0)
 *   commander.version             — `--version` was used (exit 0)
 *   commander.unknownCommand      — `astryx bogus-cmd`
 *   commander.unknownOption       — `--bogus-flag`
 *   commander.missingArgument     — `astryx theme build` (no <file>)
 *   commander.invalidArgument     — bad value for argParser
 *   commander.invalidOptionArgument
 *   commander.excessArguments
 *
 * @param {unknown} err
 * @returns {boolean} true if handled (caller should not re-throw)
 */
export function handleCommanderError(err) {
  if (!err || typeof err !== 'object' || !('code' in err)) return false;
  const code = /** @type {{code?: string, exitCode?: number, message?: string}} */ (err).code;
  if (typeof code !== 'string' || !code.startsWith('commander.')) return false;

  const exitCode = /** @type {{exitCode?: number}} */ (err).exitCode ?? 1;
  const message = /** @type {{message?: string}} */ (err).message ?? '';

  // Help / version success paths — Commander already wrote the output
  // (via our patched outputHelp for help; via its own writer for version,
  // which we handle separately in index.mjs argv preflight). Just exit
  // with the right code.
  if (
    code === 'commander.helpDisplayed' ||
    code === 'commander.help' ||
    code === 'commander.version'
  ) {
    // Showing help is a success by the exit-code contract, but it is also the
    // best available signal that someone could not find what they needed — so
    // it is flagged on the event rather than being lost in the `ok` bucket.
    recordHelp();
    setOutcome('ok', {exitCode});
    process.exit(exitCode);
  }

  // Parse failures never reach a preAction hook, so this is the only place
  // that sees them. Commander's own code (e.g. commander.unknownOption) is
  // more specific than anything we could infer, so keep it.
  setOutcome('parse-error', {
    exitCode: exitCode || 1,
    error: new Error(message.replace(/^error:\s*/i, '')),
    code: commanderCodeToErrorCode(code, message),
  });

  // Real error paths. Strip Commander's "error: " prefix once: in the envelope
  // the key is already `error`, and in text mode the Astryx prefix replaces it.
  const cleaned = message.replace(/^error:\s*/i, '');
  if (jsonActive()) {
    emitJsonError(cleaned, undefined, commanderCodeToErrorCode(code, cleaned));
  } else {
    // Commander's own line was suppressed above, so a parse failure reads the
    // same as every other CLI error — the `Error: …` line cliError prints.
    process.stderr.write(`Error: ${cleaned}\n`);
  }
  process.exit(exitCode || 1);
}
