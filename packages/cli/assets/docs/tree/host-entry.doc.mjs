// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs cli/host-entry`: run the CLI from a tool that carries it,
 * through `@astryxdesign/cli/host` (spec AST-081 FR1,
 * architecture:cli-surface INV30).
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'host-entry',
  placement: {parent: 'namespace:cli', slot: 'guides', order: 15},
  title: 'Host entry',
  category: 'guide',
  keywords: [
    'host entry',
    'runHostedCli',
    '@astryxdesign/cli/host',
    'carry the cli',
    'embed the cli',
    'programmatic run',
    'package sets',
    'cliCommand',
  ],
  description:
    'Run the Astryx CLI from your own command-line tool: the inputs `runHostedCli` takes, what it returns, and when the process ends instead.',
  sections: [
    {
      id: 'start',
      title: 'Start a run',
      content: [
        {
          type: 'prose',
          text: "A tool that carries the CLI for its own users starts one run per process with `runHostedCli` from `@astryxdesign/cli/host`. The run behaves as the CLI's own command does with the same arguments in the same folder, and the commands it prints start with your tool's command.",
        },
        {
          type: 'code',
          lang: 'javascript',
          code: "import {runHostedCli} from '@astryxdesign/cli/host';\n\nconst {status} = await runHostedCli({\n  argv: process.argv.slice(2),\n  cwd: process.cwd(),\n  cliCommand: 'acme astryx',\n});\nprocess.exitCode = status;",
        },
      ],
    },
    {
      id: 'options',
      title: 'Options',
      content: [
        {
          type: 'table',
          headers: ['Option', 'Default', 'Meaning'],
          rows: [
            [
              '`argv`',
              'none',
              'The command-line arguments, without the command name.',
            ],
            [
              '`cwd`',
              "the process's working folder",
              'The folder the run works in. It must exist.',
            ],
            [
              '`cliCommand`',
              "the package manager's name",
              'The command your users type, such as `acme astryx`: a non-blank single line of at most 120 characters, with no surrounding spaces.',
            ],
            [
              '`declinedProjectCli`',
              'none',
              "Why you did not run the project's own CLI, such as `untrusted`: a non-blank single line of at most 120 characters. That CLI then never runs.",
            ],
            [
              '`roots`',
              'none',
              'Your package sets, in order of preference: folders whose `node_modules` each hold a CLI, the Core of the same release, and integrations. A run never installs a release; it takes the release a project needs from the first set that holds it.',
            ],
            [
              '`integrations`',
              'none',
              'Integrations you approve for use outside a project, by package name.',
            ],
            [
              '`discoverSources`',
              'none',
              "Your own discover sources. `{@command discover}` reports each as the host's.",
            ],
          ],
        },
      ],
    },
    {
      id: 'result',
      title: 'Result and errors',
      content: [
        {
          type: 'list',
          style: 'unordered',
          items: [
            "It resolves with `{status, packages}`: the exit status the CLI's own command would exit with, and each package the run used, with its version and whether it came from the project or a package set.",
            'When another release answers from one of your package sets through its own host entry, that entry runs in the same process with the same inputs, and the call resolves with its result.',
            'It rejects with a `TypeError`, before anything runs, for an unknown option or an invalid value, and with an `Error` when a run already started in the process. Start each run in a new process.',
          ],
        },
      ],
    },
    {
      id: 'process-ends',
      title: 'When the process ends instead',
      content: [
        {
          type: 'prose',
          text: "Like the CLI's own command, a run ends the process with its exit status, and the call never resolves, when it:",
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'prints help or the version (`--help`, `-h`, `help`, `--version`, `-V`, `--version --json`);',
            'rejects the command line, such as an unknown command or option;',
            'reports an error it stops on, including every error in `--json` mode;',
            'meets an unexpected error;',
            "hands the run to another CLI's own command: the project's CLI when you pass no `declinedProjectCli`, or a package set whose CLI has no host entry.",
          ],
        },
      ],
    },
  ],
};
