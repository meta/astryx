// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/docs/doc-syntax`: the
 * tokens a doc writes for what the CLI shows each reader differently: a link,
 * an Astryx command, a package-manager step, and a step only one package
 * manager can do.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'doc-syntax',
  placement: {parent: 'namespace:docs', slot: 'guides', order: 15},
  title: 'Doc syntax',
  category: 'guide',
  description:
    'The tokens a doc writes for links, Astryx commands and package-manager steps, which the CLI shows each reader in their own package manager.',
  keywords: [
    'doc syntax',
    'tokens',
    'package manager',
    'npm',
    'pnpm',
    'yarn',
    'bun',
    'install command',
    'pm token',
    'command token',
  ],
  sections: [
    {
      id: 'the-tokens',
      title: 'The tokens',
      content: [
        {
          type: 'prose',
          text: 'A doc never names a package manager or a runner: readers use npm, pnpm, Yarn or Bun, and run the CLI through their own. Write a token instead, and the CLI shows each reader the command they run. Tokens work in prose, list items, table cells and code blocks.',
        },
        {
          type: 'table',
          headers: ['Write', 'For', 'A pnpm reader sees'],
          rows: [
            [
              '`{@@link generic:deploying}`',
              'another doc',
              'the command that opens that doc',
            ],
            [
              '`{@@command docs theme}`',
              'an Astryx command',
              '`pnpm exec astryx docs theme`',
            ],
            [
              '`{@@pm install @acme/widgets --dev}`',
              'a package-manager step',
              '`pnpm add -D @acme/widgets`',
            ],
            [
              '`{@@pm-only npm "why" pkg set name=x}`',
              'a step only one package manager can do',
              '`npm pkg set name=x` (only with npm: why)',
            ],
            [
              '`{@@@pm install x}`',
              'a token shown as written',
              '`{@@pm install x}`',
            ],
          ],
        },
        {
          type: 'prose',
          text: 'In prose a token prints as a code span; in a code span or code block it prints as the command alone. `--json` carries the same commands, a `{@@command}` token as the bare command that starts with astryx, which a reader that shows the doc prefixes itself.',
        },
      ],
    },
    {
      id: 'package-manager-steps',
      title: 'Package-manager steps',
      content: [
        {
          type: 'prose',
          text: "A `{@@pm}` token is a verb, its names, and the flags it takes. Each row below runs the same way in every package manager; the CLI writes the reader's own.",
        },
        {
          type: 'table',
          headers: ['Token', 'npm', 'pnpm', 'Yarn', 'Bun'],
          rows: [
            [
              '`{@@pm install}`',
              '`npm install`',
              '`pnpm install`',
              '`yarn install`',
              '`bun install`',
            ],
            [
              '`{@@pm install x}`',
              '`npm install x`',
              '`pnpm add x`',
              '`yarn add x`',
              '`bun add x`',
            ],
            [
              '`{@@pm install x --dev}`',
              '`npm install -D x`',
              '`pnpm add -D x`',
              '`yarn add -D x`',
              '`bun add -d x`',
            ],
            [
              '`{@@pm install x --global}`',
              '`npm install -g x`',
              '`pnpm add -g x`',
              '`yarn global add x` (Yarn 1); npm on Yarn 2 and newer',
              '`bun add -g x`',
            ],
            [
              '`{@@pm remove x}`',
              '`npm uninstall x`',
              '`pnpm remove x`',
              '`yarn remove x`',
              '`bun remove x`',
            ],
            [
              '`{@@pm update x --latest}`',
              '`npm install x@latest`',
              '`pnpm update --latest x`',
              '`yarn up x`',
              '`bun update --latest x`',
            ],
            [
              '`{@@pm run build --watch}`',
              '`npm run build -- --watch`',
              '`pnpm run build --watch`',
              '`yarn run build --watch`',
              '`bun run build --watch`',
            ],
            [
              '`{@@pm exec tsc}`',
              '`npx tsc`',
              '`pnpm exec tsc`',
              '`yarn run tsc`',
              '`bunx tsc`',
            ],
            [
              '`{@@pm dlx @astryxdesign/cli init}`',
              '`npx @astryxdesign/cli init`',
              '`pnpm dlx @astryxdesign/cli init`',
              '`yarn dlx …` (`npx` on Yarn 1)',
              '`bunx @astryxdesign/cli init`',
            ],
            [
              '`{@@pm create vite}`',
              '`npm create vite`',
              '`pnpm create vite`',
              '`yarn create vite`',
              '`bun create vite`',
            ],
          ],
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Flags: `--dev` and `--exact` with `install`, `--global` with `install` and `remove`, `--latest` with `update`. `--exact` takes one version, never a range: only npm pins a range.',
            'Everything after the name of a script (`run`), a binary (`exec`) or a package (`dlx`, `create`) is passed to it as written.',
            '`{@@pm install x --global}` on pnpm needs `pnpm setup` once per computer.',
          ],
        },
      ],
    },
    {
      id: 'one-package-manager',
      title: 'A step only one package manager can do',
      content: [
        {
          type: 'prose',
          text: 'Some commands exist in one package manager only, such as `npm pkg set` or `pnpm setup`. Write `{@@pm-only <manager> "<reason>" <command>}`: the manager is one of npm, pnpm, yarn, yarn-classic or bun, and the reason, in double quotes, is shown to readers beside the command. Use it only when no `{@@pm}` step does the same: doctor names a one-manager step that every package manager can run, with the `{@@pm}` token to write.',
        },
      ],
    },
    {
      id: 'what-doctor-checks',
      title: 'What doctor checks',
      content: [
        {
          type: 'prose',
          text: '`doctor integration validate`, and so `integration check`, lists each of these as a note with its file, line and the token to write. A note fails nothing today; the next minor release turns them into warnings, so `integration check --strict --next` fails on them now. Run it to fix them ahead.',
        },
        {
          type: 'table',
          headers: ['Note', 'When'],
          rows: [
            [
              '`package_manager_command`',
              'a code span or shell line written for one package manager, such as `npm install -D x`',
            ],
            [
              '`runner_command`',
              'an Astryx command written with a runner, such as `pnpm exec astryx docs`',
            ],
            [
              '`plain_command`',
              'an Astryx command written bare, where `{@@command docs}` checks that the command exists',
            ],
            [
              '`doc_token`',
              'a token that does not parse, or a name that is not a doc token',
            ],
          ],
        },
        {
          type: 'prose',
          text: "In global mode: outside a project, a `{@@command}` token prints the way your global install prints every command, and a `{@@pm}` step prints for npm unless the CLI detects another package manager. In a project, the project's own runner and package manager decide. See {@link namespace:global}.",
        },
      ],
    },
  ],
};
