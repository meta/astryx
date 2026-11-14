// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The MCP tools mirror the CLI: one tool per command that answers with
 * --json, every argument and option of that command as an input under its CLI
 * name, and a call parses back, through the CLI's own Commander program, into
 * exactly the values it was given.
 */

import {beforeAll, describe, expect, it} from 'vitest';
import {Option} from 'commander';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createProgram, JSON_SUPPORTED} from '../index.mjs';
import {buildManifest} from './manifest.mjs';
import {
  commandLine,
  CWD_INPUT,
  mcpInstructions,
  mcpTools,
  McpInputError,
  projectAgentText,
  RUN_OPTIONS,
} from './mcp-tools.mjs';

/** @type {import('commander').Command} */
let program;
/** @type {import('./mcp-tools.mjs').McpTool[]} */
let tools;
/** @type {any} */
let manifest;

beforeAll(async () => {
  program = await createProgram();
  tools = mcpTools(program, {jsonSupported: JSON_SUPPORTED});
  manifest = buildManifest(program, {jsonSupported: JSON_SUPPORTED});
});

/**
 * Every command in the manifest, depth first.
 * @param {any[]} commands
 * @returns {any[]}
 */
const flatten = commands =>
  commands.flatMap(c => [c, ...flatten(c.subcommands ?? [])]);

/**
 * The long flag of a manifest option, e.g. `--type` for `--type <domain>`.
 * @param {string} flag
 */
const longOf = flag => /--[\w-]+/.exec(flag)?.[0] ?? flag;

describe('mcpTools', () => {
  it('makes one tool for each manifest command that answers with --json, and none for a group', () => {
    const expected = flatten(manifest.commands)
      .filter(c => c.json && c.outsideProject)
      .map(c => c.name.replaceAll(' ', '_'))
      .sort();
    expect(tools.map(t => t.name).sort()).toEqual(expected);
    // A group holds subcommands and declares no outsideProject.
    for (const group of flatten(manifest.commands).filter(c => !c.outsideProject)) {
      expect(group.subcommands?.length ?? 0).toBeGreaterThan(0);
    }
    expect(tools.map(t => t.name)).not.toContain('mcp');
  });

  it('gives every argument and option of a command, and every root option, one input', () => {
    const byName = new Map(flatten(manifest.commands).map(c => [c.name, c]));
    const rootKeys = manifest.globalOptions
      .map((/** @type {any} */ o) => longOf(o.flag))
      .filter((/** @type {string} */ long) => !RUN_OPTIONS.includes(long))
      .map((/** @type {string} */ long) => long.slice(2));
    for (const tool of tools) {
      const command = byName.get(tool.words.join(' '));
      const schema = /** @type {any} */ (tool.inputSchema);
      const keys = Object.keys(schema.properties);
      const expected = [
        ...command.arguments.map((/** @type {any} */ a) => a.name),
        ...command.options.map((/** @type {any} */ o) => longOf(o.flag).slice(2)),
        ...rootKeys,
        CWD_INPUT,
      ];
      expect(keys.sort(), tool.name).toEqual([...expected].sort());
      const required = command.arguments
        .filter((/** @type {any} */ a) => a.required)
        .map((/** @type {any} */ a) => a.name);
      expect(schema.required ?? [], tool.name).toEqual(required);
      for (const arg of command.arguments) {
        expect(schema.properties[arg.name].type, `${tool.name} ${arg.name}`).toBe(
          arg.variadic ? 'array' : 'string',
        );
      }
      expect(schema.additionalProperties).toBe(false);
    }
  });

  it('describes a tool with the command\'s own help line', () => {
    const byName = new Map(flatten(manifest.commands).map(c => [c.name, c]));
    for (const tool of tools) {
      expect(tool.description).toBe(byName.get(tool.words.join(' ')).description);
    }
  });

  it('keeps only names MCP clients accept', () => {
    for (const tool of tools) {
      expect(tool.name).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
      for (const key of Object.keys(/** @type {any} */ (tool.inputSchema).properties)) {
        expect(key, tool.name).toMatch(/^[A-Za-z0-9_.-]{1,64}$/);
      }
    }
  });

  it('offers the choices a CommandDoc declares as an enum', () => {
    const search = /** @type {import('./mcp-tools.mjs').McpTool} */ (tools.find(t => t.name === 'search'));
    const type = /** @type {any} */ (search.inputSchema).properties.type;
    expect(type.enum).toEqual(['component', 'hook', 'doc', 'template', 'theme']);
  });
});

describe('projectAgentText', () => {
  /** A project with Core installed, from this repository. */
  const makeProject = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-mcp-agent-text-'));
    const core = fileURLToPath(new URL('../../../../core', import.meta.url));
    fs.mkdirSync(path.join(dir, 'node_modules', '@astryxdesign'), {recursive: true});
    fs.symlinkSync(core, path.join(dir, 'node_modules', '@astryxdesign', 'core'), 'dir');
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({name: 'app', private: true, dependencies: {'@astryxdesign/core': '*'}}),
    );
    return dir;
  };

  it('is the text init writes, without its markers, for a project with no agent docs', async () => {
    const dir = makeProject();
    try {
      const text = await projectAgentText(dir);
      expect(text).toMatch(/^Astryx v\S+ · \d+ components/);
      expect(text).not.toContain('ASTRYX:START');
      expect(text).not.toContain('ASTRYX:END');
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it('is nothing when an agent file in reach already holds it', async () => {
    const dir = makeProject();
    try {
      fs.writeFileSync(path.join(dir, 'AGENTS.md'), '<!-- ASTRYX:START -->\nAstryx\n<!-- ASTRYX:END -->\n');
      expect(await projectAgentText(dir)).toBeNull();
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});

describe('mcpInstructions', () => {
  it('opens with the project agent text when it is given one', () => {
    const text = mcpInstructions(program, tools, {agentText: 'Astryx v9 · 1 components'});
    expect(text.startsWith('Astryx v9 · 1 components\n\n')).toBe(true);
  });

  it('names every root option a tool takes and the rule from tool to command', () => {
    const text = mcpInstructions(program, tools);
    expect(text).toContain(program.description());
    for (const option of program.options) {
      if (RUN_OPTIONS.includes(option.long ?? '')) continue;
      expect(text).toContain(option.flags);
    }
    expect(text).toContain('joined by _');
  });
});

/**
 * A value for one input property, from its schema.
 * @param {any} schema
 * @param {string} key
 * @returns {unknown}
 */
function sample(schema, key) {
  if (schema.anyOf) return `${key}-value`;
  if (schema.type === 'boolean') return true;
  if (schema.type === 'array') return [`${key}-1`, `-${key}-2`];
  if (schema.enum) return schema.enum[schema.enum.length - 1];
  return `-${key}-value`;
}

/**
 * Parse `argv` with the CLI's own program and capture what the command
 * receives, without running it.
 * @param {string[]} argv
 * @returns {Promise<{operands: unknown[], opts: Record<string, unknown>, rootOpts: Record<string, unknown>}>}
 */
async function parse(argv) {
  const parser = await createProgram();
  // Parsing only: no hook, no action, and a parse error throws.
  /** @type {any} */ (parser)._lifeCycleHooks = {};
  /** @type {any} */
  let captured = null;
  /** @param {import('commander').Command} cmd */
  const stub = cmd => {
    cmd.exitOverride();
    cmd.action(function (/** @type {unknown[]} */ ...args) {
      // A command reads an option a parent declares too from that parent, as
      // `experimental icon add` reads --set: Commander gives the value to the
      // parent.
      captured = {operands: args.slice(0, -2), opts: this.optsWithGlobals(), rootOpts: parser.opts()};
    });
    for (const sub of cmd.commands) stub(sub);
  };
  stub(parser);
  await parser.parseAsync(argv, {from: 'user'});
  return captured;
}

describe('commandLine', () => {
  it('parses back, through the CLI, into exactly the values each tool was given', async () => {
    for (const tool of tools) {
      const schema = /** @type {any} */ (tool.inputSchema);
      /** @type {Record<string, unknown>} */
      const input = {};
      for (const [key, property] of Object.entries(schema.properties)) {
        if (key === CWD_INPUT) continue;
        input[key] = sample(property, key);
      }
      const {argv} = commandLine(tool, input, {root: process.cwd()});
      const parsed = await parse(argv);
      expect(parsed, tool.name).not.toBeNull();
      const operands = parsed.operands.flatMap(value =>
        Array.isArray(value) ? value : value === undefined ? [] : [value],
      );
      expect(operands, tool.name).toEqual(
        tool.args.flatMap(arg => /** @type {unknown[]} */ ([]).concat(input[arg.key])),
      );
      expect(parsed.rootOpts.json, tool.name).toBe(true);
      for (const option of tool.options) {
        const owner = parsed.opts;
        const attribute = new Option(option.long).attributeName();
        const value = owner[attribute];
        const label = `${tool.name} ${option.long}`;
        if (option.takes === 'flag') {
          expect(value, label).toBe(!option.long.startsWith('--no-'));
        } else {
          expect(value, label).toEqual(input[option.key]);
        }
      }
    }
  });

  it('puts the arguments after --, so a value that starts with a dash stays a value', () => {
    const search = /** @type {import('./mcp-tools.mjs').McpTool} */ (tools.find(t => t.name === 'search'));
    expect(commandLine(search, {query: ['-x', 'y']}, {root: '/p'}).argv).toEqual([
      'search', '--json', '--', '-x', 'y',
    ]);
  });

  it('takes one string for a list, and passes an input the tool does not declare to the command', () => {
    const search = /** @type {import('./mcp-tools.mjs').McpTool} */ (tools.find(t => t.name === 'search'));
    expect(
      commandLine(search, {query: 'dark mode', bogus: 'x', limit: 3}, {root: '/p'}).argv,
    ).toEqual(['search', '--limit=3', '--bogus=x', '--json', '--', 'dark mode']);
  });

  it('refuses an argument after a missing one, and a folder outside the one served', () => {
    const docs = /** @type {import('./mcp-tools.mjs').McpTool} */ (tools.find(t => t.name === 'docs'));
    expect(() => commandLine(docs, {section: 'x'}, {root: '/p'})).toThrow(McpInputError);
    expect(() => commandLine(docs, {[CWD_INPUT]: '../elsewhere'}, {root: '/p'})).toThrow(
      McpInputError,
    );
    expect(commandLine(docs, {[CWD_INPUT]: 'apps/web'}, {root: '/p'}).cwd).toBe(
      path.resolve('/p', 'apps/web'),
    );
  });
});
