// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The MCP tools of `astryx mcp`: the CLI's manifest, in MCP's shape.
 *
 * Each command the manifest lists as answering with --json, with an
 * `outsideProject`, is one tool; a group that only holds subcommands has no
 * `outsideProject`, so it is no tool. A tool's inputs are the command's
 * arguments and options, and the root options, under their CLI names, and a
 * call becomes the command line that runs it. The manifest is the only input,
 * so the tools are the commands of this CLI, and nothing else. A docs-only
 * server (`--docs-only`) serves the named commands that only read the docs.
 *
 * @input the CLI's manifest (`astryx manifest --json`'s data); the folder served
 * @output tool descriptors for tools/list; the command line a tools/call runs;
 *   the server instructions
 * @position clients/cli/lib — read by commands/mcp.mjs and lib/mcp-server.mjs
 */

import {renderProjectAgentDocsBlock} from '../../../api/docs/_adapter.mjs';
import {Option} from 'commander';
import {isAstryxPromptInReach} from '../../../foundation/agent-docs/agent-doc-state.mjs';
import {
  REMOVE_LINE,
} from '../../../foundation/agent-docs/agent-docs.mjs';
import {assertWithin, PathSafetyError} from '../../../foundation/fs/path-safety.mjs';

/**
 * Root options that are not tool inputs. `--json` is how every tool runs its
 * command. `--version` prints the version in place of the command; the server
 * reports the version in its `initialize` answer.
 */
export const RUN_OPTIONS = Object.freeze(['--json', '--version']);

/** The input that names the folder a command runs in. */
export const CWD_INPUT = 'cwd';

/**
 * The commands a docs-only server offers (`astryx mcp --docs-only`), by
 * command path. Each one answers from Astryx's docs and the Core the folder
 * has: it writes nothing, reads no path a caller names, and reaches no other
 * service. They are named, not inferred from the manifest, because offering a
 * command on a server many people share is a decision about that command.
 */
export const DOCS_ONLY_COMMANDS = Object.freeze([
  'search',
  'build',
  'component',
  'hook',
  'docs',
  'template',
  'discover',
  'theme list',
  'theme targets',
]);

/**
 * The inputs a docs-only tool leaves out: a package to read (`package`, and
 * the root option `base`), and the template inputs that write a file. The
 * server answers for the one Core its folder has.
 */
export const DOCS_ONLY_OMITTED_INPUTS = Object.freeze(['package', 'base', 'path', 'cdn', 'overwrite']);

/**
 * @typedef {object} McpArgument
 * @property {string} key the input property
 * @property {boolean} required
 * @property {boolean} variadic
 */

/**
 * @typedef {object} McpOption
 * @property {string} key the input property: the long flag without `--`
 * @property {string} long the long flag
 * @property {'flag' | 'value' | 'optional-value'} takes
 * @property {boolean} variadic it takes a list: the flag is given once per item
 */

/**
 * @typedef {object} McpTool
 * @property {string} name the command's words joined by `_`
 * @property {string[]} words the command's words, e.g. ['theme', 'build']
 * @property {string} title
 * @property {string} description
 * @property {Record<string, unknown>} inputSchema
 * @property {McpArgument[]} args in command-line order
 * @property {McpOption[]} options the command's options, then the root options
 * @property {boolean} docsOnly a docs-only tool: it takes no folder
 */

/**
 * Every command in a manifest's tree, depth first.
 * @param {import('./manifest').ManifestCommand[]} commands
 * @returns {import('./manifest').ManifestCommand[]}
 */
function flatten(commands) {
  return commands.flatMap(c => [c, ...flatten(c.subcommands ?? [])]);
}

/**
 * How a manifest option is given on the command line, read by Commander from
 * its flag. An option whose default is a list collects one value each time it
 * is given, as `upgrade --integration` does.
 * @param {import('./manifest').ManifestOption} manifestOption
 * @returns {McpOption}
 */
function optionEntry(manifestOption) {
  const option = new Option(manifestOption.flag);
  if (!option.long) {
    throw new Error(`${manifestOption.flag} has no long flag, so it has no tool input name`);
  }
  const takes = option.required ? 'value' : option.optional ? 'optional-value' : 'flag';
  return {
    key: option.long.slice(2),
    long: option.long,
    takes,
    variadic: takes !== 'flag' && (option.variadic || Array.isArray(manifestOption.default)),
  };
}

/**
 * The input property for one option.
 * @param {import('./manifest').ManifestOption} manifestOption
 * @param {McpOption} entry
 * @param {boolean} describe whether the property carries the option's text;
 *   the server instructions give the root options' text once
 * @returns {Record<string, unknown>}
 */
function optionSchema(manifestOption, entry, describe) {
  /** @type {Record<string, unknown>} */
  let value = {type: 'boolean'};
  if (entry.takes !== 'flag') {
    value = manifestOption.choices?.length
      ? {type: 'string', enum: [...manifestOption.choices]}
      : {type: 'string'};
    if (entry.variadic) value = {type: 'array', items: value};
    else if (entry.takes === 'optional-value') value = {anyOf: [{type: 'boolean'}, value]};
  }
  return {
    ...value,
    ...(describe && manifestOption.description ? {description: manifestOption.description} : {}),
    ...(manifestOption.default !== undefined ? {default: manifestOption.default} : {}),
  };
}

/**
 * The root options a tool takes as inputs; a docs-only tool leaves out the
 * DOCS_ONLY_OMITTED_INPUTS among them. The tools and the instructions both
 * read this list, so the instructions name exactly the root options a tool
 * takes.
 * @param {import('./manifest').CLIManifest} manifest
 * @param {boolean} docsOnly
 * @returns {import('./manifest').ManifestOption[]}
 */
function toolRootOptions(manifest, docsOnly) {
  return manifest.globalOptions.filter(o => {
    const long = new Option(o.flag).long ?? '';
    return !RUN_OPTIONS.includes(long) && !(docsOnly && DOCS_ONLY_OMITTED_INPUTS.includes(long.slice(2)));
  });
}

/**
 * The MCP tool for one manifest command.
 * @param {import('./manifest').ManifestCommand} command
 * @param {import('./manifest').ManifestOption[]} rootOptions
 * @param {boolean} docsOnly
 * @returns {McpTool}
 */
function toolOf(command, rootOptions, docsOnly) {
  const words = command.name.split(' ');
  /** @param {string} key */
  const offered = key => !docsOnly || !DOCS_ONLY_OMITTED_INPUTS.includes(key);
  /** @type {Record<string, Record<string, unknown>>} */
  const properties = {};
  /** @type {string[]} */
  const required = [];
  const args = command.arguments.filter(arg => offered(arg.name)).map(arg => {
    const item = {type: 'string'};
    properties[arg.name] = {
      ...(arg.variadic ? {type: 'array', items: item} : item),
      ...(arg.description ? {description: arg.description} : {}),
    };
    if (arg.required) required.push(arg.name);
    return {key: arg.name, required: arg.required, variadic: arg.variadic};
  });
  /** @type {McpOption[]} */
  const options = [];
  for (const [manifestOption, describe] of [
    ...command.options
      .filter(o => o.available !== false)
      .map(o => /** @type {const} */ ([o, true])),
    ...rootOptions.map(o => /** @type {const} */ ([o, false])),
  ]) {
    const entry = optionEntry(manifestOption);
    if (!offered(entry.key)) continue;
    properties[entry.key] = optionSchema(manifestOption, entry, describe);
    options.push(entry);
  }
  // The server instructions describe it once.
  if (!docsOnly) properties[CWD_INPUT] = {type: 'string'};
  return {
    name: words.join('_'),
    words,
    title: `astryx ${command.name}`,
    description: command.description,
    inputSchema: {
      type: 'object',
      properties,
      ...(required.length > 0 ? {required} : {}),
      additionalProperties: false,
    },
    args,
    options,
    docsOnly,
  };
}

/**
 * The MCP tools of the CLI: one per command the manifest lists as answering
 * with --json, with an `outsideProject`, in the manifest's order. A command or
 * an option the manifest marks unavailable on the run's base is left out. A docs-only
 * server serves the DOCS_ONLY_COMMANDS among them, without the
 * DOCS_ONLY_OMITTED_INPUTS and without a folder input.
 *
 * @param {import('./manifest').CLIManifest} manifest
 * @param {{docsOnly?: boolean}} [mode]
 * @returns {McpTool[]}
 */
export function mcpTools(manifest, {docsOnly = false} = {}) {
  const rootOptions = toolRootOptions(manifest, docsOnly);
  return flatten(manifest.commands)
    .filter(command => command.json && command.outsideProject && command.available !== false)
    .filter(command => !docsOnly || DOCS_ONLY_COMMANDS.includes(command.name))
    .map(command => toolOf(command, rootOptions, docsOnly));
}

/**
 * The agent text `astryx init` writes for the project `root` serves, without
 * its markers, so an agent that reaches the CLI only through this server reads
 * the same guidance. Null when the project already has that text in an agent
 * file within reach, or when it cannot be rendered.
 *
 * @param {string} root
 * @returns {Promise<string | null>}
 */
export async function projectAgentText(root) {
  if (isAstryxPromptInReach(root)) return null;
  try {
    const block = await renderProjectAgentDocsBlock(root);
    // The remove line is about a block in an agent file; these instructions
    // are no file, so it goes with the markers.
    return block
      .split('\n')
      .filter(line => !/^<!-- ASTRYX:(START|END) -->$/.test(line.trim()))
      .filter(line => line !== REMOVE_LINE)
      .join('\n')
      .trim();
  } catch {
    return null;
  }
}

/**
 * What a client shows the model once: the project's agent text, the CLI's
 * description, the rule from a tool to its command, and the root options, as
 * the root help gives them.
 *
 * @param {import('./manifest').CLIManifest} manifest
 * @param {{agentText?: string | null, docsOnly?: boolean}} [context]
 *   agentText from projectAgentText(); docsOnly for a docs-only server
 * @returns {string}
 */
export function mcpInstructions(manifest, {agentText = null, docsOnly = false} = {}) {
  const rootLines = toolRootOptions(manifest, docsOnly).map(o => `  ${o.flag}  ${o.description}`);
  const toolRule =
    "A tool name is the command's words joined by _ (theme build is theme_build), and its inputs are the command's arguments and options under their CLI names: a value option takes a string, and a list takes an array of strings.";
  return [
    ...(agentText ? [agentText] : []),
    manifest.description,
    docsOnly
      ? 'This server offers only the astryx commands that read the docs, and it answers for the Astryx release it has, which can differ from the one your project uses. ' +
        `Each tool runs one of those commands with --json and answers with its JSON output unchanged. ${toolRule}`
      : `Each tool runs one astryx command in this folder with --json and answers with its JSON output unchanged. ${toolRule}`,
    ['Every tool also takes the root options, which change only the reads their text names:', ...rootLines].join('\n'),
    ...(docsOnly
      ? []
      : [`and ${CWD_INPUT}, the folder to run the command in, inside this one (default: this one).`]),
    "A command's full docs are the docs tool with topic cli/commands/<the command's words joined by ->.",
  ].join('\n\n');
}

/**
 * Thrown for a tools/call input that cannot become a command line.
 */
export class McpInputError extends Error {}

/**
 * The text an input value becomes on the command line.
 * @param {unknown} value
 * @returns {string}
 */
function argText(value) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/**
 * The values of a list input; a single value is a list of one.
 * @param {unknown} value
 * @returns {string[]}
 */
function listOf(value) {
  return (Array.isArray(value) ? value : [value]).map(argText);
}

/**
 * The command-line arguments that run `tool` with `input`, and the folder to
 * run them in. An input the tool does not declare is refused, as its schema
 * says; a docs-only tool always runs in the folder served.
 *
 * @param {McpTool} tool
 * @param {Record<string, unknown>} input
 * @param {{root: string}} context the folder the server serves
 * @returns {{argv: string[], cwd: string}}
 */
export function commandLine(tool, input, {root}) {
  const given = input ?? {};
  /** @type {string[]} */
  const flags = [];
  /** @type {Set<string>} */
  const used = new Set(tool.docsOnly ? [] : [CWD_INPUT]);

  for (const option of tool.options) {
    used.add(option.key);
    const value = given[option.key];
    if (value === undefined || value === null || value === false) continue;
    if (option.takes === 'flag') {
      if (value === 'false') continue;
      if (value === true || value === 'true') flags.push(option.long);
      else flags.push(`${option.long}=${argText(value)}`);
      continue;
    }
    if (option.takes === 'optional-value' && value === true) {
      flags.push(option.long);
      continue;
    }
    for (const item of option.variadic ? listOf(value) : [argText(value)]) {
      flags.push(`${option.long}=${item}`);
    }
  }

  /** @type {string[]} */
  const positionals = [];
  let missing = /** @type {string | null} */ (null);
  for (const arg of tool.args) {
    used.add(arg.key);
    const value = given[arg.key];
    if (value === undefined || value === null) {
      missing ??= arg.key;
      continue;
    }
    if (missing != null) {
      throw new McpInputError(
        `${tool.name}: give ${missing} before ${arg.key}; the command reads its arguments in order`,
      );
    }
    positionals.push(...(arg.variadic ? listOf(value) : [argText(value)]));
  }

  for (const key of Object.keys(given)) {
    if (used.has(key)) continue;
    throw new McpInputError(
      `${tool.name} takes no ${JSON.stringify(key)}${tool.docsOnly ? ' on this server' : ''}`,
    );
  }

  return {
    argv: [
      ...tool.words,
      ...flags,
      '--json',
      ...(positionals.length > 0 ? ['--', ...positionals] : []),
    ],
    cwd: tool.docsOnly ? root : commandFolder(given[CWD_INPUT], root),
  };
}

/**
 * The folder a call runs in: `root`, or a folder inside it, also through
 * symbolic links.
 * @param {unknown} value
 * @param {string} root
 * @returns {string}
 */
function commandFolder(value, root) {
  if (value === undefined || value === null || value === '') return root;
  if (typeof value !== 'string') {
    throw new McpInputError(`${CWD_INPUT} must be a string`);
  }
  try {
    return assertWithin(value, root, {allowAbsolute: true, label: CWD_INPUT});
  } catch (error) {
    if (error instanceof PathSafetyError) throw new McpInputError(error.message);
    throw error;
  }
}
