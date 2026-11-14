// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The MCP tools of `astryx mcp`, read from the CLI's own commands.
 *
 * Each command that answers with --json and declares `outsideProject` is one
 * tool. A group that only holds subcommands declares no `outsideProject`, so it
 * is no tool. The tool takes the command's arguments, its options, and the
 * root options, under their CLI names, and a call becomes the command line
 * that runs it. The Commander program that prints --help and the manifest is
 * the only input, so the tools change when the commands change.
 *
 * @input the full Commander program, the commands that accept --json, and
 *   the folder served
 * @output tool descriptors for tools/list; the arguments a tools/call runs;
 *   the server instructions
 * @position clients/cli/lib — read by lib/mcp-server.mjs
 */

import * as path from 'node:path';
import {isAstryxPromptInReach} from '../../../foundation/agent-docs/agent-doc-state.mjs';
import {renderAgentDocsBlock} from '../../../foundation/agent-docs/agent-docs.mjs';
import {routeSegment} from '../../../foundation/discovery/docs-section-key.mjs';
import {commandDocsOf} from './define-command.mjs';

/**
 * Root options that are not tool inputs. `--json` is how every tool runs its
 * command. `--version` prints the version in place of the command; the server
 * reports the version in its `initialize` answer.
 */
export const RUN_OPTIONS = Object.freeze(['--json', '--version']);

/** The input that names the folder a command runs in. */
export const CWD_INPUT = 'cwd';

/** A tool name, as MCP clients accept it. */
const TOOL_NAME = /^[A-Za-z0-9_-]{1,64}$/;

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
 */

/**
 * The words of `cmd` below the root program.
 * @param {import('commander').Command} cmd
 * @returns {string[]}
 */
function commandWords(cmd) {
  /** @type {string[]} */
  const words = [];
  /** @type {import('commander').Command | null} */
  let c = cmd;
  while (c?.parent) {
    words.unshift(c.name());
    c = c.parent;
  }
  return words;
}

/**
 * Every command below `cmd`, depth first, without help and hidden commands.
 * @param {import('commander').Command} cmd
 * @returns {import('commander').Command[]}
 */
function commandsBelow(cmd) {
  return (cmd.commands ?? [])
    .filter(sub => !(/** @type {any} */ (sub)._hidden) && sub.name() !== 'help')
    .flatMap(sub => [sub, ...commandsBelow(sub)]);
}

/**
 * Whether an option takes a list: it is variadic, or its default is a list,
 * as `upgrade --integration` collects each flag it is given.
 * @param {import('commander').Option} option
 * @returns {boolean}
 */
function takesList(option) {
  return (option.required || option.optional) && (option.variadic || Array.isArray(option.defaultValue));
}

/**
 * The input property for one option.
 * @param {import('commander').Option} option
 * @param {{choices?: string[]}} [docOption] the CommandDoc's own entry
 * @returns {Record<string, unknown>}
 */
function optionSchema(option, docOption) {
  const description = option.description;
  const choices = option.argChoices ?? docOption?.choices;
  /** @type {Record<string, unknown>} */
  let value;
  if (!option.required && !option.optional) {
    value = {type: 'boolean'};
  } else if (choices?.length) {
    value = {type: 'string', enum: [...choices]};
  } else {
    value = {type: 'string'};
  }
  if (takesList(option)) value = {type: 'array', items: value};
  else if (option.optional) {
    // `--flag [value]`: the flag alone, or the flag with a value.
    value = {anyOf: [{type: 'boolean'}, value]};
  }
  /** @type {Record<string, unknown>} */
  const schema = {...value};
  if (description) schema.description = description;
  if (option.defaultValue !== undefined) schema.default = option.defaultValue;
  return schema;
}

/**
 * The input property for a root option. The server instructions describe
 * root options once, as the root help does.
 * @param {import('commander').Option} option
 * @returns {Record<string, unknown>}
 */
function rootOptionSchema(option) {
  const {description: _description, ...schema} = optionSchema(option);
  return schema;
}

/**
 * Describe `option` for building its command line.
 * @param {import('commander').Option} option
 * @returns {McpOption}
 */
function optionEntry(option) {
  if (!option.long) {
    throw new Error(
      `${option.flags} has no long flag, so it has no tool input name`,
    );
  }
  return {
    key: option.long.slice(2),
    long: option.long,
    takes: option.required
      ? 'value'
      : option.optional
        ? 'optional-value'
        : 'flag',
    variadic: takesList(option),
  };
}

/**
 * The MCP tool for one command.
 * @param {import('commander').Command} cmd
 * @param {import('commander').Option[]} rootOptions
 * @returns {McpTool}
 */
function toolOf(cmd, rootOptions) {
  const words = commandWords(cmd);
  const name = words.join('_');
  if (!TOOL_NAME.test(name)) {
    throw new Error(`"${words.join(' ')}" gives the tool name "${name}", which MCP does not accept`);
  }
  const docs = commandDocsOf(cmd);
  /** @type {Record<string, Record<string, unknown>>} */
  const properties = {};
  /** @type {string[]} */
  const required = [];
  /**
   * @param {string} key
   * @param {Record<string, unknown>} schema
   */
  const addProperty = (key, schema) => {
    if (Object.hasOwn(properties, key)) {
      throw new Error(`"${words.join(' ')}" has two inputs named "${key}"`);
    }
    properties[key] = schema;
  };

  const declared = /** @type {any[]} */ (
    /** @type {any} */ (cmd).registeredArguments ?? []
  );
  /** @type {McpArgument[]} */
  const args = declared.map(arg => {
    const key = String(arg.name());
    const docArg = docs?.doc.args?.find(a => a.name === key);
    const description =
      arg.description ||
      docs?.fn?.params?.find(p => p.name === docArg?.param)?.description ||
      '';
    /** @type {Record<string, unknown>} */
    const item = {type: 'string'};
    addProperty(key, {
      ...(arg.variadic ? {type: 'array', items: item} : item),
      ...(description ? {description} : {}),
    });
    if (arg.required) required.push(key);
    return {key, required: arg.required === true, variadic: arg.variadic === true};
  });

  /** @type {McpOption[]} */
  const options = [];
  for (const option of cmd.options ?? []) {
    if (option.hidden) continue;
    const entry = optionEntry(option);
    const docOption = docs?.doc.options?.find(o => o.flag === option.flags);
    addProperty(entry.key, optionSchema(option, docOption));
    if (option.mandatory) required.push(entry.key);
    options.push(entry);
  }
  for (const option of rootOptions) {
    const entry = optionEntry(option);
    addProperty(entry.key, rootOptionSchema(option));
    options.push(entry);
  }
  // The server instructions describe it once.
  addProperty(CWD_INPUT, {type: 'string'});

  return {
    name,
    words,
    title: `astryx ${words.join(' ')}`,
    description: cmd.description(),
    inputSchema: {
      type: 'object',
      properties,
      ...(required.length > 0 ? {required} : {}),
      additionalProperties: false,
    },
    args,
    options,
  };
}

/**
 * The root options a tool takes as inputs.
 * @param {import('commander').Command} program
 * @returns {import('commander').Option[]}
 */
export function toolRootOptions(program) {
  return (program.options ?? []).filter(
    option => !option.hidden && !RUN_OPTIONS.includes(option.long ?? ''),
  );
}

/**
 * The MCP tools of the CLI: one per command that answers with --json and
 * declares `outsideProject`, in the manifest's order.
 *
 * @param {import('commander').Command} program the root, with every command
 *   loaded
 * @param {{jsonSupported: Set<string>}} context
 * @returns {McpTool[]}
 */
export function mcpTools(program, {jsonSupported}) {
  const rootOptions = toolRootOptions(program);
  const tools = commandsBelow(program)
    .filter(cmd => {
      const words = commandWords(cmd);
      return (
        jsonSupported.has(words.join(' ')) &&
        commandDocsOf(cmd)?.doc.outsideProject != null
      );
    })
    .map(cmd => toolOf(cmd, rootOptions))
    .sort((a, b) => a.title.localeCompare(b.title));
  const names = new Set();
  for (const tool of tools) {
    if (names.has(tool.name)) {
      throw new Error(`two commands give the tool name "${tool.name}"`);
    }
    names.add(tool.name);
  }
  return tools;
}

/**
 * The docs route of one tool, as an example: the route help prints in its
 * `More:` line.
 * @param {McpTool[]} tools
 * @returns {string}
 */
function docsExample(tools) {
  const tool = tools.find(t => t.words.length > 1) ?? tools[0];
  return tool ? `: ${tool.name} is cli/commands/${routeSegment(tool.words.join(' '))}` : '';
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
    const block = await renderAgentDocsBlock(root);
    return block
      .split('\n')
      .filter(line => !/^<!-- ASTRYX:(START|END) -->$/.test(line.trim()))
      .join('\n')
      .trim();
  } catch {
    return null;
  }
}

/**
 * What a client shows the model once: the project's agent text, what the
 * tools are, how a tool name and its inputs map to the command line, and the
 * root options, as the root help gives them.
 *
 * @param {import('commander').Command} program
 * @param {McpTool[]} tools
 * @param {{agentText?: string | null}} [context] from projectAgentText()
 * @returns {string}
 */
export function mcpInstructions(program, tools, {agentText = null} = {}) {
  const example =
    tools.find(tool => tool.words.length > 1 && tool.args.length > 0) ??
    tools[0];
  const exampleLine = example
    ? ` For example, \`astryx ${example.words.join(' ')} <${example.args[0]?.key ?? ''}>\` is the tool ${example.name}.`
    : '';
  const rootLines = toolRootOptions(program).map(
    option => `  ${option.flags}  ${option.description}`,
  );
  return [
    ...(agentText ? [agentText] : []),
    program.description(),
    'Each tool runs one astryx command in this folder with --json and answers with its JSON output unchanged. ' +
      `A tool name is the command's words joined by _, and its inputs are the command's arguments and options under their CLI names: a value option takes a string, and a list takes an array of strings.${exampleLine}`,
    ['Every tool also takes the root options, which change only the reads their text names:', ...rootLines].join('\n'),
    `and ${CWD_INPUT}, the folder to run the command in, inside this one (default: this one).`,
    `A command's full docs (its examples, exit codes and notes) are the docs tool with topic cli/commands/<tool name, - for _>${docsExample(tools)}.`,
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
 * run them in. An input the tool does not declare goes to the command as
 * `--<name>`, so the command answers it as the CLI does.
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
  const used = new Set([CWD_INPUT]);

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

  for (const [key, value] of Object.entries(given)) {
    if (used.has(key) || value === undefined || value === null || value === false) continue;
    if (value === true) flags.push(`--${key}`);
    else for (const item of listOf(value)) flags.push(`--${key}=${item}`);
  }

  return {
    argv: [
      ...tool.words,
      ...flags,
      '--json',
      ...(positionals.length > 0 ? ['--', ...positionals] : []),
    ],
    cwd: commandFolder(given[CWD_INPUT], root),
  };
}

/**
 * The folder a call runs in: `root`, or a folder inside it.
 * @param {unknown} value
 * @param {string} root
 * @returns {string}
 */
function commandFolder(value, root) {
  if (value === undefined || value === null || value === '') return root;
  if (typeof value !== 'string') {
    throw new McpInputError(`${CWD_INPUT} must be a string`);
  }
  const folder = path.resolve(root, value);
  const rel = path.relative(root, folder);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new McpInputError(
      `${CWD_INPUT} must be inside ${root}; ${value} is not`,
    );
  }
  return folder;
}
