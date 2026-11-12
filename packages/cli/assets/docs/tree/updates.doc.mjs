// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs global/updates`: how the global install learns of newer
 * versions, and the notice it prints (spec AST-081 FR6, FR10).
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'updates',
  placement: {
    parent: 'namespace:global',
    slot: 'guides',
    order: 4,
  },
  title: 'Updates and notices',
  category: 'guide',
  keywords: [
    'update',
    'upgrade',
    'upgrade astryx',
    'update notice',
    'new release',
    'new version',
    'NO_UPDATE_NOTIFIER',
    'latest',
  ],
  description:
    'Your global install checks for a newer version once a day and prints a two-line notice after a command succeeds. It never upgrades itself or a project.',
  sections: [
    {
      id: 'notice',
      title: 'The notice',
      content: [
        {
          type: 'prose',
          text: "Once a day, never in your first day, your global install checks the registry's `latest` version in the background, without slowing the command. When a newer one exists, a command that succeeds prints two lines on standard error, at most once a day:",
        },
        {
          type: 'code',
          lang: 'text',
          code: 'A new release of Astryx is available: 0.7.2 → 0.7.3\nTo upgrade, run: npm i -g @astryxdesign/cli@latest',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            "The command is the one for the package manager that installed your global install: `npm i -g`, `pnpm add -g`, `yarn global add`, `bun add -g`, or `volta install`. A global folder moved with the package manager's own setting (`BUN_INSTALL`, Yarn's `global-folder`, `PNPM_HOME`, or npm's prefix) counts while that setting names it; an app's own copy never runs the update check.",
            'When the newest version needs a newer Node than your computer runs, the second line says which Node to install first.',
            "Inside a project, the notice is about the project's version, and names the project's install and `upgrade` commands. The install command always adds the CLI next to Core, so a project that installed only Core gets its own CLI too, as recommended.",
          ],
        },
      ],
    },
    {
      id: 'project-notice',
      title: 'In a project',
      content: [
        {
          type: 'code',
          lang: 'text',
          code: 'A new release of Astryx is available: 0.7.1 → 0.7.3\nTo upgrade, run: pnpm add @astryxdesign/core@0.7.3 @astryxdesign/cli@0.7.3, then pnpm exec astryx upgrade --from 0.7.1 --apply',
        },
      ],
    },
    {
      id: 'turn-off',
      title: 'Turn it off',
      content: [
        {
          type: 'prose',
          text: 'No notice prints with `--json`, after a failed command, when the `CI` environment variable is set, or when `NO_UPDATE_NOTIFIER` is set; with either variable set, the CLI does not check the registry either. Unlike some CLIs, a notice prints even when standard error is not a terminal, because agents run the CLI without one.',
        },
        {
          type: 'prose',
          text: '`{@command doctor}` shows the same thing at any time, in its `newest-release` check, along with why the last notice did not print, if one did not. When the last check ran, and when each notice printed, are kept in `state.json` in the settings folder ({@link generic:reference}).',
        },
      ],
    },
    {
      id: 'more',
      title: 'More on global mode',
      content: [
        {
          type: 'prose',
          text: 'This page is part of {@link namespace:global}, which explains what global mode is and how each part works. Upgrading a project: {@link command:upgrade}.',
        },
      ],
    },
  ],
};
