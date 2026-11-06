// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/configuration/cli-command`:
 * name the command an integration's users run the CLI with, so every command
 * the CLI prints in their apps starts with it.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'cli-command',
  placement: {parent: 'namespace:configuration', slot: 'guides', order: 15},
  title: 'CLI command',
  category: 'guide',
  keywords: [
    'cliCommand',
    'command name',
    'wrapper',
    'printed commands',
    'pnpm exec astryx',
  ],
  description:
    'Name the command your users run the CLI with, so every command the CLI prints in their apps starts with it.',
  sections: [
    {
      id: 'when-to-set-it',
      title: 'When to set it',
      content: [
        {
          type: 'prose',
          text: "The CLI ends most answers with the next command to run: a hint, an error fix, a Doctor fix, or a doc example. By default each one starts with a command that reaches the release that answered: what the app's package manager runs, such as `pnpm exec astryx` or `yarn astryx`, when the app's own CLI answered, and otherwise the CLI package pinned to that release, such as `{@pm dlx @astryxdesign/cli@0.7.2}`.",
        },
        {
          type: 'prose',
          text: 'Set `cliCommand` only when your users run the CLI some other way, such as a wrapper your company ships that runs it with your package loaded. Otherwise the commands the CLI prints send them, and their agents, to a CLI that answers without your package. Most packages leave it out.',
        },
      ],
    },
    {
      id: 'set-it',
      title: 'Set it',
      content: [
        {
          type: 'prose',
          text: 'Add `cliCommand` to `astryx.integration.mjs`: the command, without a subcommand.',
        },
        {
          type: 'code',
          lang: 'js',
          code: `// astryx.integration.mjs
export default {
  components: './components',
  cliCommand: 'acme astryx',
};`,
        },
        {
          type: 'prose',
          text: 'In an app that installs your package, the CLI then prints every command with it:',
        },
        {
          type: 'code',
          lang: 'text',
          code: 'Error: Theme "ocean" is not added. Run `acme astryx theme add ocean` first.',
        },
        {
          type: 'prose',
          text: 'That covers hints, errors, suggestions, Doctor fixes, `--help`, the setup reminder, the agent block `init` writes, and doc text. `--json` output keeps every command without a runner, as in `"command": "astryx theme add ocean"`, so a script reads the same fields in every app.',
        },
      ],
    },
    {
      id: 'how-the-cli-picks',
      title: 'How the CLI picks the command',
      content: [
        {
          type: 'list',
          style: 'ordered',
          items: [
            'The `cliCommand` of the packages the app loads, when they name one command.',
            'The command a host tool names when it runs the CLI for the app. Nothing in a plain project names one.',
            "A command that reaches the release that answered: what the app's package manager runs when the app's own CLI answered, such as `pnpm exec astryx` or `yarn astryx`; `astryx` outside a project when the CLI installed for the computer answered; otherwise the CLI package pinned to that release, such as `{@pm dlx @astryxdesign/cli@0.7.2}` (see {@link generic:who-answers}).",
          ],
        },
        {
          type: 'prose',
          text: 'Two packages that set the same command agree, and the CLI uses it.',
        },
      ],
    },
    {
      id: 'when-two-packages-disagree',
      title: 'When two packages disagree',
      content: [
        {
          type: 'prose',
          text: "If two packages an app loads set different commands, the CLI uses neither: it prints commands with what the app's package manager runs, even when a host tool named a command. `{@command doctor}` warns in its `cli-command` check and names both packages:",
        },
        {
          type: 'code',
          lang: 'text',
          code: `status:  [warn]
label:   CLI command
message: Loaded integrations declare different CLI commands: @acme/astryx-widgets (\`acme astryx\`), @other/kit (\`other astryx\`). Neither is used, so printed commands start with \`pnpm exec astryx\`.`,
        },
        {
          type: 'prose',
          text: 'The app fixes it by removing the package that does not belong, or the packages agree on one command.',
        },
      ],
    },
    {
      id: 'check-it',
      title: 'Check it',
      content: [
        {
          type: 'prose',
          text: 'An invalid value is ignored, and the rest of your manifest still loads. `{@command doctor integration validate}` reports it as `invalid_cli_command`. A valid `cliCommand` is one line of plain text without spaces at either end, at most 120 characters.',
        },
        {
          type: 'prose',
          text: "In an app that installs your package, `{@command doctor}` passes its `cli-command` check and names your package as the one that set the command. A CLI released before this field reports `cliCommand` as an unknown key and prints the package manager's command.",
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@command doctor integration validate}\n# In an app that installs the package\n{@command doctor}',
        },
      ],
    },
    {
      id: 'global-mode',
      title: 'In global mode',
      content: [
        {
          type: 'prose',
          text: "In global mode: outside a project, the `cliCommand` of integrations installed for the computer applies; when none is declared, commands start with the plain command of the CLI installed for the computer. Inside a project, only the project's integrations count, so a `cliCommand` from a package installed for the computer never changes the project's printed commands. See {@link namespace:global} and {@link generic:global-integrations}.",
        },
      ],
    },
  ],
};
