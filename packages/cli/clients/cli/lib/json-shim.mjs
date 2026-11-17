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

import {
  API_VERSION,
  isJsonMode,
  toErrorEnvelope,
} from '../../../foundation/response/json.mjs';
import {answeredBy} from '../../../foundation/release/run-context.mjs';
import {unknownSubcommandSuggestions} from './cli-error.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';
import {
  setCommand,
  setOutcome,
  recordHelp,
} from '../../../foundation/debug/index.mjs';
import {
  formatCliCommand,
  getCliInvocation,
  quoteCommandArgument,
} from '../../../foundation/env/package-manager.mjs';
import {
  commandAvailable,
  helpBase,
  optionAvailable,
  servedHelpDescription,
  servedHelpOptionDescription,
  servedSubcommands,
} from './base-gate.mjs';
import {commandPath} from './command-path.mjs';

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

  const base = helpBase();
  /** @type {Array<{flags: string, description: string, defaultValue?: unknown, choices?: string[]}>} */
  const options = cmd.options.filter(o => optionAvailable(cmd, o, base)).map(o => {
    /** @type {any} */
    const opt = {flags: o.flags, description: servedHelpOptionDescription(cmd, o) || ''};
    if (o.defaultValue !== undefined) opt.defaultValue = o.defaultValue;
    if (Array.isArray(o.argChoices) && o.argChoices.length)
      opt.choices = o.argChoices;
    return opt;
  });

  const subcommands = cmd.commands
    .filter(s => !(/** @type {any} */ (s)._hidden) && commandAvailable(s, base))
    // Off Core, a group's listing reads its summary, as text help does: its
    // full description can name commands the base refuses.
    .map(s => ({
      name: s.name(),
      description:
        (base != null && !base.core && s.summary()) || servedHelpDescription(s) || '',
    }));

  return {
    apiVersion: API_VERSION,
    type: 'help',
    data: {
      command: nameParts.join(' '),
      description: servedHelpDescription(cmd) || '',
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
    .filter(
      s =>
        !(/** @type {any} */ (s))._hidden &&
        s.name() !== 'help' &&
        commandAvailable(s, helpBase()),
    )
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
  const group = commandPath(cmd);
  return toErrorEnvelope(
    `'${group}' needs a subcommand`,
    available.map(name => ({
      name: `${group} ${name}`,
      reason: 'available subcommand',
    })),
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
    case UNKNOWN_SUBCOMMAND:
      return ERROR_CODES.ERR_UNKNOWN_SUBCOMMAND;
    case 'commander.missingArgument':
    case 'commander.optionMissingArgument':
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
 * Whether a command, by its words (`theme build`), answers `--json`. The
 * answer to an option a command does not take offers `--json` only then.
 * @type {(path: string) => boolean}
 */
let jsonSupported = () => true;

/**
 * Install the shim on a Commander program. Idempotent — safe to call
 * once at program-construction time.
 *
 * @param {import('commander').Command} program
 * @param {{jsonSupported?: (path: string) => boolean}} [options]
 */
export function installJsonShim(program, options = {}) {
  if (options.jsonSupported) jsonSupported = options.jsonSupported;
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
      setCommand(commandPath(cmd));
    } catch {
      // Never let recording interfere with the error path.
    }
    // The error handler names the rejected command's usage from it.
    /** @type {any} */ (err)[REJECTED_COMMAND] = cmd;
    throw err;
  });
  cmd.configureOutput({
    writeOut: str => process.stdout.write(str),
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
    writeErr: str => {
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

/** Carries the command Commander rejected from exitOverride to the error handler. */
const REJECTED_COMMAND = Symbol.for('astryx.jsonShim.rejectedCommand');

/** A group given a word that is none of its subcommands. */
const UNKNOWN_SUBCOMMAND = 'astryx.unknownSubcommand';

/**
 * The word typed after a group's own words that is none of its
 * subcommands, read from the command line; null when there is none.
 * @param {any} group
 * @returns {string | null}
 */
function unknownGroupWord(group) {
  const chain = [];
  for (let node = group; node?.parent; node = node.parent)
    chain.unshift(node.name());
  let root = group;
  while (root.parent) root = root.parent;
  const argv = /** @type {string[]} */ (root.rawArgs ?? process.argv);
  const names = group.commands.flatMap((/** @type {any} */ c) => [
    c.name(),
    ...c.aliases(),
  ]);
  // The words that are no option, and no option's value: the word after an
  // option the group does not read is its value unless it names one of the
  // group's subcommands (`preview --theme t`: t is --theme's).
  /** @type {string[]} */
  const words = [];
  const typed = argv.slice(2).map(String);
  for (let i = 0; i < typed.length; i++) {
    const w = typed[i];
    if (!w.startsWith('-')) {
      words.push(w);
      continue;
    }
    const next = typed[i + 1];
    if (
      words.length >= chain.length &&
      !w.includes('=') &&
      next != null &&
      !next.startsWith('-') &&
      !names.includes(next)
    )
      i++;
  }
  for (let i = 0; i < chain.length; i++) if (words[i] !== chain[i]) return null;
  const next = words[chain.length];
  return next != null && !names.includes(next) ? next : null;
}

/**
 * Options typed after a group with no subcommand at all (`preview --theme
 * t`, `editor --mode light`): each option as typed, with its value, and the
 * subcommands that take every one of them; null when a word that is no
 * option's value follows (an unknown subcommand) or a subcommand does.
 * @param {any} group
 * @returns {{group: string, typed: string[], takers: any[]} | null}
 */
function optionsWithoutSubcommand(group) {
  const chain = [];
  for (let node = group; node?.parent; node = node.parent)
    chain.unshift(node.name());
  let root = group;
  while (root.parent) root = root.parent;
  const argv = /** @type {string[]} */ (root.rawArgs ?? process.argv)
    .slice(2)
    .map(String);
  let at = 0;
  for (const word of chain) {
    while (at < argv.length && argv[at] !== word) at++;
    if (at === argv.length) return null;
    at++;
  }
  const rest = argv.slice(at);
  if (!rest.length || !rest[0].startsWith('-')) return null;
  const subs = servedSubcommands(group);
  /** @type {string[]} */
  const flags = [];
  /** @type {string[]} */
  const typed = [];
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    // A word that is no option's value: a subcommand or an unknown word,
    // which other readers name.
    if (!token.startsWith('-')) return null;
    const [flag, inline] = token.split(/=(.*)/su);
    const program = (root.options ?? []).find(
      (/** @type {any} */ o) => o.long === flag || o.short === flag,
    );
    const next = rest[i + 1];
    const value =
      inline ??
      (next != null &&
      !next.startsWith('-') &&
      !(program && !(program.required || program.optional)) &&
      !subs.some(c => c.name() === next || c.aliases().includes(next))
        ? rest[++i]
        : undefined);
    // The program's own options (`--json`) are read wherever they are.
    if (program) continue;
    flags.push(flag);
    typed.push(
      value === undefined ? flag : `${flag} ${quoteCommandArgument(value)}`,
    );
  }
  if (!typed.length) return null;
  const takers = subs.filter(c =>
    flags.every(f =>
      (c.options ?? []).some(
        (/** @type {any} */ o) => o.long === f || o.short === f,
      ),
    ),
  );
  return {group: chain.join(' '), typed, takers};
}

/**
 * Options typed before a group's real subcommand (`preview --theme t list`,
 * `editor --mode light set t accent red`): the subcommand, the options it
 * takes (each with its value, where it takes one) and the ones it does not,
 * and the command with those it takes moved after it; null when no word after
 * the options is one of the group's subcommands. An option's value is never
 * read as a subcommand.
 * @param {any} group
 * @returns {{sub: string, line: string, moved: string[], dropped: string[]} | null}
 */
function optionsBeforeSubcommand(group) {
  const chain = [];
  for (let node = group; node?.parent; node = node.parent)
    chain.unshift(node.name());
  let root = group;
  while (root.parent) root = root.parent;
  const argv = /** @type {string[]} */ (root.rawArgs ?? process.argv).slice(2);
  // The group's own words, in order, then what follows them.
  let at = 0;
  for (const word of chain) {
    while (at < argv.length && argv[at] !== word) at++;
    if (at === argv.length) return null;
    at++;
  }
  const rest = argv.slice(at);
  if (!rest.length || !String(rest[0]).startsWith('-')) return null;
  const subs = servedSubcommands(group);
  /** The command a list of commands names by a word. @param {any[]} list @param {unknown} w */
  const named = (list, w) =>
    list.find(c => c.name() === w || c.aliases().includes(w));
  /** @type {any} */
  let sub = null;
  let index = -1;
  /** The subcommand words from the group's own on (`editor set`). @type {string[]} */
  let subWords = [];
  let end = -1;
  /**
   * The command the words from rest[i] on name: a subcommand, into a nested
   * group (`theme --mode dark editor set …`) as far as the words go; null
   * when rest[i] names none.
   * @param {number} i
   */
  const resolve = i => {
    const first = String(rest[i]).startsWith('-') ? null : named(subs, rest[i]);
    if (!first) return null;
    let target = first;
    const words = [first.name()];
    let j = i + 1;
    while (named(servedSubcommands(target), rest[j])) {
      target = named(servedSubcommands(target), rest[j]);
      words.push(target.name());
      j++;
    }
    return {target, words, end: j};
  };
  /** Whether a command takes a flag with a value. @param {any} cmd @param {string} flag */
  const takesValue = (cmd, flag) =>
    (cmd.options ?? []).some(
      (/** @type {any} */ o) =>
        (o.long === flag || o.short === flag) && (o.required || o.optional),
    );
  for (let i = 1; i < rest.length && !sub; i++) {
    const found = resolve(i);
    if (!found) continue;
    // The word straight after an option that this command, or a later one
    // named after it, takes with a value is that value (`--on set set t …`,
    // `--on show set t …`), never the subcommand.
    const prev = String(rest[i - 1]);
    if (prev.startsWith('-') && !prev.includes('=')) {
      let valued = takesValue(found.target, prev);
      for (let k = i + 1; !valued && k < rest.length; k++) {
        const later = resolve(k);
        if (later && takesValue(later.target, prev)) valued = true;
      }
      if (valued) continue;
    }
    sub = found.target;
    index = i;
    subWords = found.words;
    end = found.end;
  }
  if (!sub) return null;
  /** @type {string[]} */
  const moved = [];
  /** @type {string[]} */
  const dropped = [];
  // The program's own options (`--json`) are read wherever they are typed:
  // never moved, named, or carried into the line.
  const own = (/** @type {string} */ flag) =>
    (root.options ?? []).find(
      (/** @type {any} */ o) => o.long === flag || o.short === flag,
    );
  const before = rest.slice(0, index);
  for (let i = 0; i < before.length; i++) {
    const token = String(before[i]);
    if (!token.startsWith('-')) continue;
    const [flag, inline] = token.split(/=(.*)/su);
    const program = own(flag);
    if (program) {
      if ((program.required || program.optional) && inline == null) i++;
      continue;
    }
    const opt = (sub.options ?? []).find(
      (/** @type {any} */ o) => o.long === flag || o.short === flag,
    );
    // The word after an option is its value when the option takes one, or
    // when no subcommand reads it (it is not an option itself).
    const next = before[i + 1];
    const takesValue = opt
      ? Boolean(opt.required || opt.optional)
      : next != null && !String(next).startsWith('-');
    const value =
      inline ??
      (takesValue && next != null && !String(next).startsWith('-')
        ? String(before[++i])
        : undefined);
    const typed =
      value === undefined ? flag : `${flag} ${quoteCommandArgument(value)}`;
    (opt ? moved : dropped).push(typed);
  }
  /** @type {string[]} */
  const after = [];
  const tail = rest.slice(end).map(String);
  for (let i = 0; i < tail.length; i++) {
    const program = own(tail[i].split('=')[0]);
    if (program) {
      if ((program.required || program.optional) && !tail[i].includes('=')) i++;
      continue;
    }
    after.push(quoteCommandArgument(tail[i]));
  }
  const line = [
    getCliInvocation(process.cwd()),
    ...chain,
    ...subWords,
    ...after,
    ...moved,
  ].join(' ');
  return {sub: [...chain, ...subWords].join(' '), line, moved, dropped};
}

/**
 * Whether a parse error came from a theme editor or preview command, whose
 * missing-argument message names what was given.
 * @param {unknown} err
 */
function isEditorCommand(err) {
  const parts = [];
  for (
    let node = /** @type {any} */ (err)?.[REJECTED_COMMAND];
    node;
    node = node.parent
  )
    parts.unshift(node.name());
  return (
    parts.slice(1, 3).join(' ') === 'experimental theme' &&
    ['editor', 'preview'].includes(parts[3])
  );
}

/**
 * The usage line of the command a parse error came from, as a suggestion, for
 * an option given without its value.
 * @param {unknown} err
 * @param {string} code
 * @returns {import('../../../foundation/response/base').Suggestion[] | undefined}
 */
function usageSuggestion(err, code) {
  const cmd = /** @type {any} */ (err)?.[REJECTED_COMMAND];
  if (!cmd) return undefined;
  const parts = [];
  for (let node = cmd; node; node = node.parent) parts.unshift(node.name());
  // The theme editor and its preview commands name what is missing with
  // their usage and help, as the project runs the CLI.
  if (
    code === 'commander.missingArgument' &&
    parts.slice(1, 3).join(' ') === 'experimental theme' &&
    ['editor', 'preview'].includes(parts[3])
  )
    return editorMissingSuggestions(cmd);
  // An experimental theme command missing its argument (`experimental
  // theme compile`): its usage and help, as the project runs the CLI.
  // Stable commands (`theme build`) keep their output as released.
  if (
    code === 'commander.missingArgument' &&
    parts.slice(1, 3).join(' ') === 'experimental theme'
  ) {
    const words = parts.slice(1).join(' ');
    const invocation = getCliInvocation(process.cwd());
    return [
      {name: `${invocation} ${words} ${cmd.usage()}`.trim(), reason: 'usage'},
      {name: `${invocation} ${words} --help`, reason: 'what each argument is'},
    ];
  }
  if (code !== 'commander.optionMissingArgument') return undefined;
  // The command's usage with the option in it, as it takes its value
  // (`astryx theme build --out <path> <files...>`).
  const flags = /option '([^']+)' argument missing/.exec(
    /** @type {any} */ (err)?.message ?? '',
  )?.[1];
  const option = flags
    ? /--[\w-]+(?:\s+[<[][^>\]]*[>\]])?/.exec(flags)?.[0]
    : undefined;
  const usage = option
    ? cmd.usage().replace('[options]', `${option} [options]`)
    : cmd.usage();
  return [{name: `${parts.join(' ')} ${usage}`.trim(), reason: 'usage'}];
}

/**
 * The theme editor's message for a missing argument: what the command takes
 * and the words it was given, in order.
 * @param {unknown} err
 * @param {string} message Commander's message
 */
function editorMissingMessage(err, message) {
  const cmd = /** @type {any} */ (err)?.[REJECTED_COMMAND];
  const wants = (cmd?.registeredArguments ?? [])
    .filter((/** @type {any} */ a) => a.required)
    .map((/** @type {any} */ a) => a.name());
  return editorMissingArgument(cmd, wants, /'([^']+)'/.exec(message)?.[1])
    .message;
}

/**
 * The editor themes of the app a command runs in, as the theme editor
 * lists them; the editor registers it, so this module reads no theme files.
 * @type {(cwd: string) => string[]}
 */
let editorThemesHere = () => [];

/**
 * How the theme commands read an option commander does not know, or one
 * given no value (commander's code says which), which the editor
 * registers: the message and the commands that work, or undefined for a
 * command it does not read.
 * @type {(cmd: any, code: string) => {message: string, suggestions: Array<{name: string, reason: string}>} | undefined | Promise<{message: string, suggestions: Array<{name: string, reason: string}>} | undefined>}
 */
let unknownOptionReader = () => undefined;

/**
 * Register how the theme commands read an option they do not take.
 * @param {(cmd: any, code: string) => {message: string, suggestions: Array<{name: string, reason: string}>} | undefined | Promise<{message: string, suggestions: Array<{name: string, reason: string}>} | undefined>} read
 */
export function setUnknownOptionReader(read) {
  unknownOptionReader = read;
}

/**
 * The word a theme command missing its one argument is offered, the one its
 * own refusals offer (`new`: a theme name no theme here has; `preview app`:
 * a folder that is free), with why; null for a command that has none. The
 * editor registers it, so this module reads no theme files.
 * @type {(cwd: string, words: string) => {word: string, reason: string} | null}
 */
let freeArgument = () => null;

/**
 * Register the word a theme command missing its one argument is offered.
 * @param {(cwd: string, words: string) => {word: string, reason: string} | null} free
 *   `words`: the command's words after the program, `experimental theme editor new`
 */
export function setFreeArgument(free) {
  freeArgument = free;
}

/**
 * Register how the theme editor lists the themes of the app a command runs
 * in, for the missing-theme suggestions.
 * @param {(cwd: string) => string[]} list
 */
export function setEditorThemeList(list) {
  editorThemesHere = list;
}

/**
 * The options a command was given on its command line, as they were typed
 * (`--on card --mode dark --only`), so a line offered for it keeps them:
 * dropped, a line for one part or mode would change the whole theme.
 * @param {any} cmd the Commander command
 * @returns {string} the options, or ''
 */
function typedOptions(cmd) {
  /** @type {string[]} */
  const out = [];
  for (const opt of cmd?.options ?? []) {
    const key = opt.attributeName();
    if (cmd.getOptionValueSource?.(key) !== 'cli') continue;
    const value = cmd.getOptionValue(key);
    const flag = opt.long ?? opt.short;
    if (typeof value === 'boolean') out.push(flag);
    else
      for (const v of Array.isArray(value) ? value : [value])
        out.push(`${flag} ${quoteCommandArgument(String(v))}`);
  }
  return out.join(' ');
}

/**
 * The theme editor's usage and help suggestions for a missing argument, as
 * the project runs the CLI. A line that names the missing word keeps the
 * options typed (typedOptions).
 * @param {any} cmd
 * @returns {Array<{name: string, reason: string}>}
 */
function editorMissingSuggestions(cmd) {
  const parts = [];
  for (let node = cmd; node; node = node.parent) parts.unshift(node.name());
  const words = parts.slice(1).join(' ');
  const invocation = getCliInvocation(process.cwd());
  const typed = typedOptions(cmd);
  const withTyped = (/** @type {string} */ line) =>
    typed ? `${line} ${typed}` : line;
  // No theme named, and the app has exactly one editor theme: the command
  // on that theme, when the theme is all it takes.
  const wants = (cmd?.registeredArguments ?? []).filter(
    (/** @type {any} */ a) => a.required,
  );
  // (`new` names a theme that does not exist yet: never the one here.)
  if (
    !(cmd?.args ?? []).length &&
    wants.length === 1 &&
    wants[0].name() === 'theme' &&
    cmd.name() !== 'new'
  ) {
    const themes = editorThemesHere(process.cwd());
    if (themes.length === 1)
      return [
        {
          name: withTyped(`${invocation} ${words} ${themes[0]}`),
          reason: `do this instead: ${themes[0]} is the theme here`,
        },
        {
          name: `${invocation} ${words} --help`,
          reason: 'what each argument is',
        },
      ];
  }
  // Words given with the theme left out (`set corners pill`), in an app
  // with one editor theme that none of the words names: the same words on
  // that theme.
  const given = (cmd?.args ?? []).map(String);
  if (given.length && wants[0]?.name() === 'theme' && cmd.name() !== 'new') {
    const themes = editorThemesHere(process.cwd());
    // A whole command pasted as one word (`set 'set t accent red'`, `set
    // 'npx … editor set t accent red'`): the command it is, its words read
    // as typed, when its theme is one here.
    if (given.length === 1 && /\s/.test(given[0])) {
      const pasted = given[0]
        .trim()
        .replace(/^.*?\beditor\s+/, '')
        .replace(new RegExp(`^${cmd.name()}\\s+`), '')
        .split(/\s+/);
      if (themes.includes(pasted[0]))
        return [
          {
            name: withTyped(
              `${invocation} ${words} ${pasted.map((/** @type {string} */ w) => quoteCommandArgument(w)).join(' ')}`,
            ),
            reason:
              'do this instead: the command pasted as one word, read as its words',
          },
          {
            name: `${invocation} ${words} --help`,
            reason: 'what each argument is',
          },
        ];
    }
    if (themes.length === 1 && !given.includes(themes[0]))
      return [
        {
          name: withTyped(
            `${invocation} ${words} ${themes[0]} ${given.map((/** @type {string} */ w) => quoteCommandArgument(w)).join(' ')}`,
          ),
          reason: `do this instead: ${themes[0]} is the theme here`,
        },
        {
          name: `${invocation} ${words} --help`,
          reason: 'what each argument is',
        },
      ];
  }
  // A command whose one argument names something new (`new`'s theme,
  // `preview app`'s folder), given none: the free word its own refusals
  // offer.
  const free =
    !(cmd?.args ?? []).length && wants.length === 1
      ? freeArgument(process.cwd(), words)
      : null;
  if (free)
    return [
      {
        name: withTyped(`${invocation} ${words} ${free.word}`),
        reason: `do this instead: ${free.reason}`,
      },
      {name: `${invocation} ${words} --help`, reason: 'what each argument is'},
    ];
  return [
    {name: `${invocation} ${words} ${cmd.usage()}`.trim(), reason: 'usage'},
    {name: `${invocation} ${words} --help`, reason: 'what each argument is'},
  ];
}

/**
 * The theme editor's missing-argument report: what the command takes, the
 * words it was given and what each was read as, and its usage and help.
 * The parser's error uses it, and so does a command that checks its own
 * arguments (set, whose value may come inside a pasted declaration).
 * @param {any} cmd the Commander command
 * @param {string[]} wants the argument names it takes, in order
 * @param {string | undefined} missing the argument that is missing
 * @returns {{message: string, suggestions: Array<{name: string, reason: string}>}}
 */
export function editorMissingArgument(cmd, wants, missing) {
  const given = /** @type {string[]} */ (cmd?.args ?? []);
  const shown = wants.map(w => `<${w}>`);
  return {
    message: `${cmd.name()} takes ${shown.join(' ')}, and ${given.length ? `was given ${given.length} (${given.join(' ')}), read as ${shown.slice(0, given.length).join(' ')}` : 'was given none'}: ${missing ? `<${missing}>` : 'an argument'} is missing.`,
    suggestions: editorMissingSuggestions(cmd),
  };
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
  anyCmd.outputHelp = function patchedOutputHelp(
    /** @type {any} */ contextOptions,
  ) {
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
  proto.outputHelp = function patchedProtoOutputHelp(
    /** @type {any} */ contextOptions,
  ) {
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
 * @returns {boolean | Promise<boolean>} true if handled (caller should not
 *   re-throw); a promise when the answer is written once its suggestions
 *   are checked
 */
export function handleCommanderError(err) {
  if (!err || typeof err !== 'object' || !('code' in err)) return false;
  const code =
    /** @type {{code?: string, exitCode?: number, message?: string}} */ (err)
      .code;
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

  // A group of the experimental theme commands given a word it does not
  // have, then an option (`experimental theme preview path --theme t`): the
  // word is what is wrong, named as when no option follows it, with the
  // group's subcommands closest first. Stable groups keep their error.
  const rejected = /** @type {any} */ (err)?.[REJECTED_COMMAND];
  const group = rejected;
  const chain = [];
  for (let node = group; node?.parent; node = node.parent)
    chain.unshift(node.name());
  // Options typed before one of the group's subcommands: the subcommand is
  // what was meant, with the options it takes after it.
  const early =
    code === 'commander.unknownOption' &&
    group?.commands?.length &&
    chain.slice(0, 2).join(' ') === 'experimental theme'
      ? optionsBeforeSubcommand(group)
      : null;
  if (early) {
    const help = `${getCliInvocation(process.cwd())} ${early.sub} --help`;
    return finishParseError(err, code, message, exitCode, {
      message: early.dropped.length
        ? `${early.dropped.join(', ')} ${early.dropped.length > 1 ? 'are' : 'is'} typed before ${early.sub}, which takes no such option.`
        : `${early.moved.join(', ')} ${early.moved.length > 1 ? 'go' : 'goes'} after the subcommand: ${early.sub} takes ${early.moved.length > 1 ? 'them' : 'it'} there.`,
      suggestions: [
        {
          name: early.line,
          reason: early.dropped.length
            ? `do this instead: without ${early.dropped.join(', ')}${early.moved.length ? `, with ${early.moved.join(', ')} after the subcommand` : ''}`
            : 'do this instead: the options after the subcommand',
        },
        {name: help, reason: 'the options it takes'},
      ],
    });
  }
  // Options with no subcommand at all (`preview --theme t`): no option's
  // value is a subcommand; the subcommands that take them are named.
  const bare =
    code === 'commander.unknownOption' &&
    group?.commands?.length &&
    chain.slice(0, 2).join(' ') === 'experimental theme'
      ? optionsWithoutSubcommand(group)
      : null;
  if (bare) {
    const inv = getCliInvocation(process.cwd());
    const these = bare.typed.join(' ');
    const many = bare.typed.length > 1;
    return finishParseError(err, code, message, exitCode, {
      message: bare.takers.length
        ? `${bare.typed.join(', ')} ${many ? 'are' : 'is'} typed with no subcommand of ${bare.group}; ${bare.takers.map(c => c.name()).join(', ')} ${bare.takers.length > 1 ? 'take' : 'takes'} ${many ? 'them' : 'it'}.`
        : `${bare.group} needs a subcommand, and none of its subcommands takes ${bare.typed.join(', ')}.`,
      suggestions: [
        // A subcommand that needs nothing more runs with the options; one
        // that needs its own words shows them.
        ...bare.takers.slice(0, 3).map(c =>
          (c.registeredArguments ?? []).some(
            (/** @type {any} */ a) => a.required,
          )
            ? {
                name: `${inv} ${bare.group} ${c.name()} --help`,
                reason: `${c.name()} takes ${these}; what else it needs`,
              }
            : {
                name: `${inv} ${bare.group} ${c.name()} ${these}`,
                reason: `do this instead: ${c.name()} with ${these}`,
              },
        ),
        {name: `${inv} ${bare.group} --help`, reason: 'its subcommands'},
      ],
    });
  }
  const word =
    code === 'commander.unknownOption' &&
    group?.commands?.length &&
    chain.slice(0, 2).join(' ') === 'experimental theme'
      ? unknownGroupWord(group)
      : null;
  if (word) {
    return finishParseError(err, UNKNOWN_SUBCOMMAND, message, exitCode, {
      message: `unknown subcommand '${chain.join(' ')} ${word}'`,
      suggestions: unknownSubcommandSuggestions(
        `${getCliInvocation(process.cwd())} ${chain.join(' ')}`,
        word,
        servedSubcommands(group).map((/** @type {any} */ c) => c.name()),
      ),
    });
  }
  // An option a command does not take: the editor's own reader reads its
  // commands' options; every other command gets the generic answer.
  if (code === 'commander.unknownOption' && rejected)
    return answerStrayOption(err, rejected, message, exitCode);

  // Real error paths. Strip Commander's "error: " prefix once: in the envelope
  // the key is already `error`, and in text mode the Astryx prefix replaces it.
  // The editor's reader also reads an option given without its value and
  // words a theme command does not take.
  const read =
    code === 'commander.optionMissingArgument' ||
    code === 'commander.excessArguments'
      ? unknownOptionReader(rejected, code)
      : undefined;
  // The reader checks the commands it offers as the command itself would
  // (which may take a moment): the answer is written once it has them.
  if (read instanceof Promise)
    return read.then(r => finishParseError(err, code, message, exitCode, r));
  return finishParseError(err, code, message, exitCode, read);
}

/**
 * The answer to an option a command does not take, loaded only for this
 * error. On the program itself, before a word that names no command
 * (`astryx describe Table --format json`), the unknown command is the fault
 * to report, and its answer names the command meant. Otherwise the editor's
 * reader reads the option for its own commands, and every other command
 * gets the options it takes and the run as meant (./stray-option.mjs).
 * @param {unknown} err
 * @param {any} rejected the command that refused the option
 * @param {string} message Commander's message
 * @param {number} exitCode
 * @returns {Promise<boolean>}
 */
async function answerStrayOption(err, rejected, message, exitCode) {
  const code = 'commander.unknownOption';
  const words = process.argv.slice(2);
  const stray = /unknown option '([^']+)'/.exec(message)?.[1] ?? '';
  const {strayOptionAnswer, withoutStray} = await import('./stray-option.mjs');
  if (!rejected.parent) {
    const {findEntry, firstWord, unknownCommandAnswer} =
      await import('./unknown-command.mjs');
    // Only a word before the stray option is read as the command: after it,
    // the word may be the option's value (`astryx --format text component
    // Table`), and the unknown option stays the fault.
    const at = words.indexOf(stray);
    const first = firstWord(at < 0 ? words : words.slice(0, at), rejected);
    const cleaned = withoutStray(words, stray, rejected.options);
    if (
      first &&
      !rejected.commands.some((/** @type {any} */ c) => c.name() === first.word)
    ) {
      const answer = await unknownCommandAnswer(rejected, cleaned, {
        findEntry,
      });
      setOutcome('parse-error', {
        exitCode: exitCode || 1,
        error: new Error(answer?.message ?? message),
        code: ERROR_CODES.ERR_UNKNOWN_COMMAND,
      });
      return finishParseError(
        err,
        code,
        message,
        exitCode,
        answer && {
          message: answer.message,
          // Only the runs: a near or listed command name is no run to print
          // after `Run:`, so the program's help stands in for those.
          suggestions: answer.suggestions.some(s =>
            s.name.startsWith('astryx '),
          )
            ? answer.suggestions
                .filter(s => s.name.startsWith('astryx '))
                .map(s => ({name: formatCliCommand(s.name), reason: s.reason}))
            : [{name: formatCliCommand('--help'), reason: 'every command'}],
        },
        ERROR_CODES.ERR_UNKNOWN_COMMAND,
      );
    }
  }
  const read = await unknownOptionReader(rejected, code);
  return finishParseError(
    err,
    code,
    message,
    exitCode,
    read ??
      strayOptionAnswer(rejected, message.replace(/^error:\s*/i, ''), words, {
        jsonSupported,
      }),
  );
}

/**
 * The rest of {@link handleCommanderError} for a parse failure: the message
 * and suggestions written (the theme reader's answer when it read the
 * option), and the exit.
 * @param {unknown} err
 * @param {string} code
 * @param {string} message
 * @param {number} exitCode
 * @param {{message: string, suggestions: Array<{name: string, reason: string}>} | undefined | null} read
 * @param {string} [errorCode] the code the answer reports, when it is not
 *   the one Commander's code maps to
 * @returns {boolean}
 */
function finishParseError(err, code, message, exitCode, read, errorCode) {
  const answer = read ?? undefined;
  const suggestions = answer?.suggestions ?? usageSuggestion(err, code);
  // In the theme editor a missing argument names what was given: in
  // `set corners small` the first word is read as the theme, so "value" alone
  // would name the wrong thing.
  const cleaned = answer
    ? answer.message
    : code === 'commander.missingArgument' &&
        suggestions?.length === 2 &&
        isEditorCommand(err)
      ? editorMissingMessage(err, message)
      : message.replace(/^error:\s*/i, '');
  if (jsonActive()) {
    emitJsonError(
      cleaned,
      suggestions,
      errorCode ?? commanderCodeToErrorCode(code, cleaned),
    );
  } else {
    // Commander's own line was suppressed above, so a parse failure reads the
    // same as every other CLI error — the `Error: …` line cliError prints.
    process.stderr.write(`Error: ${cleaned}\n`);
    if (suggestions)
      process.stderr.write(
        `${suggestions[0].reason === 'usage' ? 'Usage' : 'Run'}: ${suggestions[0].name}\n`,
      );
    if (suggestions?.[1]) process.stderr.write(`Run: ${suggestions[1].name}\n`);
  }
  process.exit(exitCode || 1);
}
