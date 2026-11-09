// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Capability manifest — self-describing CLI surface for agents.
 *
 * `astryx --json` (and `astryx manifest --json`) emit a structured manifest that
 * lets an AI agent drive the entire CLI WITHOUT scraping `--help` text. It is
 * to the CLI what an OpenAPI spec is to an HTTP API.
 *
 * Its per-command facts come from the command's own definitions: names,
 * arguments and options from Commander metadata (program.commands, cmd.options,
 * cmd.registeredArguments, cmd.description()); examples, exit codes, and what
 * it does outside a project from its CommandDoc;
 * response `type` discriminators from the returns of the FunctionDoc it wraps
 * (both attached by `defineCommand`); `--json` support from the JSON_SUPPORTED
 * allowlist in index.mjs. The hand-kept lists are CLI_LAYER_RESPONSE_TYPES,
 * for envelopes no API function returns, and ROOT_RESPONSE_TYPES, for the two
 * (help and version) that no single command owns.
 *
 * Drift-guard tests (manifest.test.mjs) assert every registered command appears
 * in the manifest, every JSON-supported command has response types, and the
 * examples and response types equal the docs, so adding a command without
 * describing it fails CI.
 *
 * DESIGN DECISION — manifest stays CLI-special; there is intentionally NO
 * `api/manifest`. It describes the CLI's own Commander tree, so it takes the live
 * `program` as a parameter and lives in `lib/` (shared infra the CLI can import
 * without a cycle). An `api/manifest` entry would have to import the program from
 * `cli/index.mjs` — the `api → cli` cycle that bit #4302 — or force programmatic
 * callers to construct a program themselves. So `buildManifest(program)` is the
 * intended shape, and the bare `astryx --json` / `astryx manifest --json` handlers
 * are its only consumers. Do not "extract" this to `api/` in the reorg.
 *
 * @input  a configured Commander `program` + the JSON_SUPPORTED allowlist
 * @output a `{ name, version, globalOptions, commands, responseTypes }` object
 * @position consumed by the bare `astryx --json` action and the `manifest` command
 */

import {API_VERSION} from '../../../foundation/response/json.mjs';
import {commandDocsOf} from './define-command.mjs';
import {doc as manifestDoc} from '../commands/manifest.doc.mjs';

/**
 * What a run may do beyond the command it was asked for (spec AST-081;
 * `spec:AST-017` FR14), and where it is explained.
 */
export const GLOBAL_MODE = Object.freeze({
  docs: 'astryx docs global',
  summary:
    "In a folder that belongs to a project, the project's own CLI answers: this copy hands the run to it. In a project with no CLI of its own, and outside any project, this copy answers. A copy installed for the computer checks the registry for a newer release once a day in the background, and keeps one agent skill file in the home folder.",
});

/**
 * Envelopes the CLI layer builds itself, so the wrapped FunctionDoc cannot
 * declare them: `manifest` wraps no API function, `theme build` batches several
 * `themeBuild()` receipts, and `theme add` with no slug (or `--list`) answers
 * with `themeListAvailable()`'s `theme.list` instead of calling `themeAdd()`.
 * manifest.test.mjs fails once the wrapped FunctionDoc declares one of these, so
 * the list only shrinks.
 * @type {Record<string, string[]>}
 */
const CLI_LAYER_RESPONSE_TYPES = {
  manifest: ['manifest'],
  'theme build': ['theme.build.batch'],
  'theme add': ['theme.list'],
};

/**
 * Response types no single command owns: `help` (a bare `astryx --json`, and
 * `--help --json` on any command) and `version` (`astryx --version --json`).
 * The response-types enum lists them beside the per-command response types.
 * @type {readonly string[]}
 */
export const ROOT_RESPONSE_TYPES = Object.freeze(['help', 'version']);

/**
 * Map a Commander Option to a flag descriptor. Derives type from whether the
 * option takes a value (boolean vs string), surfaces `choices` and `default`.
 *
 * @param {import('commander').Option} opt
 * @returns {import('./manifest').ManifestOption}
 */
function describeOption(opt) {
  const o = /** @type {any} */ (opt);
  const takesValue = o.required || o.optional;
  /** @type {any} */
  const d = {
    flag: o.flags,
    description: o.description || '',
    type: takesValue ? 'string' : 'boolean',
  };
  if (Array.isArray(o.argChoices) && o.argChoices.length > 0) {
    d.choices = [...o.argChoices];
    d.type = 'enum';
  }
  if (o.defaultValue !== undefined) d.default = o.defaultValue;
  // `--no-foo` style negation flags
  if (o.negate) d.negate = true;
  return d;
}

/**
 * Map a Commander positional argument to an arg descriptor.
 * @param {import('commander').Argument} arg
 * @returns {import('./manifest').ManifestArgument}
 */
function describeArgument(arg) {
  const a = /** @type {any} */ (arg);
  return {
    name: a.name(),
    required: a.required === true,
    variadic: a.variadic === true,
    description: a.description || '',
  };
}

/**
 * Compute the fully-qualified command name relative to the root program,
 * e.g. `theme build`. The root program itself maps to ''.
 * @param {import('commander').Command} cmd
 * @param {import('commander').Command} root
 * @returns {string}
 */
function fullName(cmd, root) {
  const parts = [];
  /** @type {import('commander').Command | null} */
  let c = cmd;
  while (c && c !== root) {
    parts.unshift(c.name());
    c = c.parent;
  }
  return parts.join(' ');
}

/**
 * The docs a command was built from. `manifest` is registered by hand in
 * index.mjs, so its CommandDoc is read here.
 * @param {import('commander').Command} cmd
 * @param {string} name
 */
function docsOf(cmd, name) {
  return (
    commandDocsOf(cmd) ?? (name === 'manifest' ? {doc: manifestDoc} : undefined)
  );
}

/**
 * Recursively describe a Commander command and its subcommands.
 *
 * @param {import('commander').Command} cmd
 * @param {import('commander').Command} root
 * @param {Set<string>} jsonSupported  fully-qualified names that support --json
 * @returns {import('./manifest').ManifestCommand | null}  null for hidden/internal commands
 */
function describeCommand(cmd, root, jsonSupported) {
  const name = fullName(cmd, root);
  // Skip the auto-generated help command and any hidden/internal commands
  // (e.g. the postinstall shim) — agents never invoke these directly.
  // `_hidden` is a Commander internal not present on its public types.
  if (!name || /** @type {any} */ (cmd)._hidden || name === 'help') return null;

  const docs = docsOf(cmd, name);

  const subcommands = /** @type {object[]} */ (
    (cmd.commands || [])
      .map(sub => describeCommand(sub, root, jsonSupported))
      .filter(Boolean)
  );

  // `registeredArguments` is Commander 12's public-ish accessor; `_args` is the
  // older internal. Cast through any to read whichever exists.
  const args = /** @type {any[]} */ (
    /** @type {any} */ (cmd).registeredArguments ||
      /** @type {any} */ (cmd)._args ||
      []
  );

  /** @type {any} */
  const entry = {
    name,
    description: cmd.description() || '',
    arguments: args.map(describeArgument),
    options: (cmd.options || []).map(describeOption),
    json: jsonSupported.has(name),
  };

  const aliases = cmd.aliases ? cmd.aliases() : [];
  if (aliases && aliases.length > 0) entry.aliases = [...aliases];

  // Response types this command can emit in --json mode: the returns of the
  // FunctionDoc it wraps, then any envelope the CLI layer builds. Subcommand
  // groups (e.g. bare `theme`) have none.
  const responseTypes = [
    ...(docs?.fn?.returns ?? []).map(r => r.type),
    ...(CLI_LAYER_RESPONSE_TYPES[name] ?? []),
  ];
  if (responseTypes.length > 0) entry.responseTypes = responseTypes;

  const examples = (docs?.doc.examples ?? []).map(e => e.cli);
  if (examples.length > 0) entry.examples = examples;

  const exitCodes = (docs?.doc.exitCodes ?? []).map(({code, when}) => ({
    code,
    when,
  }));
  if (exitCodes.length > 0) entry.exitCodes = exitCodes;

  // What the command does outside a project (spec AST-081 FR4). Every command
  // declares it in its CommandDoc; a group that only holds subcommands does not.
  if (docs?.doc.outsideProject) entry.outsideProject = docs.doc.outsideProject;

  // Sort subcommands by name for a stable, agent-facing contract — the same
  // guarantee the top-level command list makes. Otherwise Commander
  // registration order leaks into the manifest and a pure reorder of
  // `.command()` calls silently changes the output.
  if (subcommands.length > 0) {
    entry.subcommands = subcommands.sort((a, b) =>
      /** @type {any} */ (a).name.localeCompare(/** @type {any} */ (b).name),
    );
  }

  return entry;
}

/**
 * Describe the global options declared on the root program (--json, --lang,
 * --detail, --zh, --dense, --version). Documented once at top level so each
 * command entry doesn't repeat them.
 *
 * @param {import('commander').Command} program
 * @returns {import('./manifest').ManifestOption[]}
 */
function describeGlobalOptions(program) {
  const opts = (program.options || []).map(describeOption);
  // Commander registers a built-in --version flag; if for some reason it
  // isn't present in program.options, surface it so the manifest is complete.
  if (!opts.some(o => /(^|[\s,])--version\b/.test(o.flag))) {
    opts.push({
      flag: '-V, --version',
      description: 'Output the version number',
      type: 'boolean',
    });
  }
  return opts;
}

/**
 * Every command in a described tree, depth first.
 * @param {any[]} commands
 * @returns {any[]}
 */
function flattenCommands(commands) {
  return commands.flatMap(c => [c, ...flattenCommands(c.subcommands || [])]);
}

/**
 * Build the full capability manifest from a configured Commander program.
 *
 * @param {import('commander').Command} program  the root program
 * @param {object} [opts]
 * @param {Set<string>} [opts.jsonSupported]  the JSON_SUPPORTED allowlist
 * @param {string} [opts.version]  CLI version (defaults to program.version())
 * @returns {import('./manifest').CLIManifest}  the manifest `data` payload (sans envelope)
 */
export function buildManifest(program, opts = {}) {
  const jsonSupported = opts.jsonSupported || new Set();
  const version = opts.version || /** @type {any} */ (program)._version || '';

  const commands = /** @type {any[]} */ (
    (program.commands || [])
      .map(cmd => describeCommand(cmd, program, jsonSupported))
      .filter(Boolean)
  ).sort((a, b) => a.name.localeCompare(b.name));

  return {
    name: 'astryx',
    version,
    apiVersion: API_VERSION,
    description: program.description() || '',
    globalOptions: describeGlobalOptions(program),
    commands,
    jsonSupported: [...jsonSupported].sort(),
    globalMode: GLOBAL_MODE,
    // Flat index of every response `type` discriminator the CLI can emit,
    // keyed by command — lets an agent know what to expect back per call.
    responseTypes: Object.fromEntries(
      flattenCommands(commands)
        .filter(c => c.responseTypes)
        .map(c => [c.name, [...c.responseTypes]]),
    ),
  };
}
