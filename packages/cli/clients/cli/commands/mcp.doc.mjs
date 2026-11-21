// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for `astryx mcp`. A CLI-only command with no wrapped API
 * function (so no `fn`): it serves the CLI's own commands as Model Context
 * Protocol tools, and each tool call runs one of them.
 * @position packages/cli/clients/cli/commands — command documentation
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'mcp',
  displayName: 'astryx mcp',
  namespace: 'cli/commands',
  summary:
    'For AI tools that cannot run commands: serve every astryx command as an MCP tool, over stdio',
  description:
    'For an AI tool that reaches tools only through the Model Context Protocol (MCP). ' +
    'An agent that can run commands runs astryx itself, which is the usual way to use Astryx. ' +
    'Starts an MCP server on standard input and output, for an MCP client to launch. ' +
    'Each command that answers with --json is one tool, named by its words (theme build is theme_build), ' +
    'with the command\'s arguments and options as its inputs under their CLI names; an input a tool does not list is refused. ' +
    'A tool call runs that command with --json in this folder, or in the folder a call names inside it, ' +
    'and answers with the command\'s output unchanged; a command that exits non-zero answers as an error. ' +
    'The tools come from the same command definitions as --help and the manifest, so they always match this CLI. ' +
    'With --docs-only it serves only the commands that read the docs, for a server many people share, such as the one the docs site runs. ' +
    'Standard output carries only protocol messages, so --json does not apply.',
  options: [
    {
      flag: '--docs-only',
      cliOnly: true,
      description:
        'Serve only the commands that read the docs (search, build, component, hook, docs, template, discover, theme list',
      pointers: [
        {commands: ['theme targets'], text: ' and theme targets'},
        '), one message at a time, without the inputs that name a folder, a file to write or a package to read',
      ],
    },
  ],
  examples: [
    {label: 'Serve this folder to an MCP client', cli: 'astryx mcp'},
    {label: 'Serve only the commands that read the docs', cli: 'astryx mcp --docs-only'},
  ],
  outsideProject: 'same',
  notes: [
    {
      type: 'prose',
      text: 'In global mode, as for every command, the project\'s own CLI answers in a project: the tools are its commands, and each call runs its release. See {@link namespace:global}.',
    },
  ],
  exitCodes: [
    {code: 0, when: 'the client closed the connection'},
    {code: 1, when: '--json was given, or the tools could not be read from the CLI'},
  ],
  related: ['manifest', 'docs', 'init'],
};
