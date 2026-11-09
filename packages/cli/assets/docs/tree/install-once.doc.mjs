// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs global/install-once`: install the CLI for the computer with each
 * package manager; the cache of versions projects need; offline (spec AST-081).
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'install-once',
  placement: {
    parent: 'namespace:global',
    slot: 'guides',
    order: 2,
  },
  title: 'Install Astryx globally',
  category: 'guide',
  keywords: [
    'pnpm add -g',
    'yarn global add',
    'bun add -g',
    'volta install',
    'npx',
    'offline',
    'cache',
    'per-user cache',
    'EACCES',
    'permission denied',
    'sudo',
    'npm prefix',
  ],
  description:
    'Install the Astryx CLI once for your computer with npm, pnpm, Yarn, Bun, or Volta, and what happens when you are offline.',
  sections: [
    {
      id: 'install',
      title: 'Install it',
      content: [
        {
          type: 'prose',
          text: 'Install the CLI package with your package manager. One astryx command then works in every folder.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@pm install @astryxdesign/cli --global}\n# with Volta: volta install @astryxdesign/cli',
        },
        {
          type: 'prose',
          text: "Keep the CLI installed in each project too: that pins its version for teammates and CI ({@link generic:project-global-or-both}). Inside a project, whichever astryx command you type, the project's version answers. Outside a project, your global install answers with its own version, and a version you name, such as `{@pm dlx @astryxdesign/cli@0.7.0}`, answers as exactly that version.",
        },
      ],
    },
    {
      id: 'eacces',
      title: 'Permission denied (EACCES)',
      content: [
        {
          type: 'prose',
          text: 'If `npm i -g` fails with `EACCES`, do not use `sudo`. Give npm a global folder you own, then add its `bin` folder to your PATH, or use a Node version manager such as nvm, fnm, or Volta:',
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@pm-only npm "moves the npm global folder" config set prefix ~/.npm-global}\nexport PATH="$HOME/.npm-global/bin:$PATH"\n{@pm-only npm "installs into the npm global folder above" i -g @astryxdesign/cli}',
        },
        {
          type: 'prose',
          text: "Astryx's update notice then names that folder in its upgrade command.",
        },
      ],
    },
    {
      id: 'versions-for-projects',
      title: 'Versions for your projects',
      content: [
        {
          type: 'prose',
          text: "When a project's own CLI is installed but cannot start, Astryx runs the CLI version equal to the project's Core instead, installing it once into a cache in your home folder and reusing it. It uses npm for that, so your npm registry, proxy, and offline settings apply. Deleting the cache is safe: versions come back when a project needs them. Where it lives: {@link generic:reference}.",
        },
      ],
    },
    {
      id: 'offline',
      title: 'Offline',
      content: [
        {
          type: 'prose',
          text: "Your global install answers offline in a project with only Core, and so does any project that installs its own CLI. Outside a project, commands that read components, such as `{@command component Button}`, need your global version's Core: after any command you run online, your global install downloads it once into the cache in the background, so they work offline from then on (not in CI, where nothing downloads by itself: {@link generic:ci-and-containers}; and not on Windows, where the first component command downloads it). Only a project whose own CLI cannot start needs a version installed or cached; when it is neither and cannot be fetched, your global install answers with a one-line warning, and Astryx waits 2 minutes before trying to download it again (10 minutes after a second failure in a row). {@link generic:problems} has the exact message.",
        },
      ],
    },
    {
      id: 'more',
      title: 'More on global mode',
      content: [
        {
          type: 'prose',
          text: 'This page is part of {@link namespace:global}, which explains what global mode is and how each part works. Next: {@link generic:who-answers}.',
        },
      ],
    },
  ],
};
