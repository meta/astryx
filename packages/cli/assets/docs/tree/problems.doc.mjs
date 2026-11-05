// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs global/problems`: every line global mode prints, with its
 * cause and fix, quoted from the CLI's own strings (test/global-mode-docs.test.mjs
 * fails when they differ); install problems package managers cause.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'problems',
  placement: {
    parent: 'namespace:global',
    slot: 'guides',
    order: 9,
  },
  title: 'Troubleshooting global mode',
  category: 'guide',
  keywords: [
    'troubleshooting',
    'error',
    'not working',
    'command not found',
    'ERR_VERSIONS_UNAVAILABLE',
    'ERR_PROJECT_REQUIRED',
    'proxy',
    'registry',
    'corepack',
    'windows',
    'PATH',
    'wrong astryx',
    'fallback',
    'could not get Astryx',
  ],
  description:
    'Every line Astryx prints in global mode, what it means, and what to do. Plus the install problems package managers cause: permissions, PATH, Corepack, and Windows.',
  sections: [
    {
      id: 'answered-by',
      title: '"astryx: answered by …"',
      content: [
        {
          type: 'code',
          lang: 'text',
          code: 'astryx: answered by CLI 0.7.2 with Core 0.7.2, outside a project',
        },
        {
          type: 'prose',
          text: 'Information, not an error: it names the version that answered and why. It prints in text mode only, never with `--json`. The other forms: {@link generic:who-answers}.',
        },
      ],
    },
    {
      id: 'installing',
      title: '"installing CLI release … into the per-user cache"',
      content: [
        {
          type: 'code',
          lang: 'text',
          code: 'astryx: installing CLI release 0.6.8 into the per-user cache (once)...\nastryx: waiting for another run to finish installing CLI release 0.6.8...',
        },
        {
          type: 'prose',
          text: "The project's own CLI cannot start, so Astryx is installing the CLI version equal to its Core into its cache once. The second line means another run is installing it; this one waits, up to 15 minutes. To avoid the wait, install the project's dependencies.",
        },
      ],
    },
    {
      id: 'notices',
      title: '"A new release of Astryx is available"',
      content: [
        {
          type: 'code',
          lang: 'text',
          code: 'A new release of Astryx is available: 0.7.2 → 0.7.3\nTo upgrade, run: npm i -g @astryxdesign/cli@latest\nTo upgrade, install Node >=22 (this computer runs Node 20.11.0), then run: npm i -g @astryxdesign/cli@latest',
        },
        {
          type: 'prose',
          text: 'A newer version is out; run the command shown. When the newest version needs a newer Node, the second line names it first. To stop notices, set `NO_UPDATE_NOTIFIER`: {@link generic:updates}.',
        },
      ],
    },
    {
      id: 'old-astryx',
      title: '"The astryx command on this computer runs CLI …"',
      content: [
        {
          type: 'code',
          lang: 'text',
          code: 'The astryx command on this computer runs CLI 0.6.4, which answers every folder itself.\nTo upgrade, run: npm i -g @astryxdesign/cli@latest',
        },
        {
          type: 'prose',
          text: "The first astryx command on your PATH is a version from before global mode, so it ignores your projects' versions. Run the command shown, or remove that install. `{@command doctor}` lists every astryx command on your PATH in its `cli-on-path` check.",
        },
      ],
    },
    {
      id: 'fallback',
      title: '"could not get Astryx … to match this project\'s Core"',
      content: [
        {
          type: 'code',
          lang: 'text',
          code: "astryx: could not get Astryx 0.6.8 to match this project's Core (the registry could not be reached); answering with CLI 0.7.2 instead\nastryx: could not get Astryx 0.6.8 to match this project's Core (the registry does not have it); answering with CLI 0.7.2 instead\nastryx: could not get Astryx 0.6.8 to match this project's Core (the release cache /home/me/.cache/astryx/releases cannot be written (EACCES)); answering with CLI 0.7.2 instead",
        },
        {
          type: 'prose',
          text: "The project's own CLI cannot start, so Astryx needs the CLI version equal to its Core, and could not get it, so the command still runs: the astryx command you started answers, as before global mode. Its answers may not match the project's Core until you fix the cause. With `--json`, `meta.answeredBy.copy` is `fallback`. Astryx waits 2 minutes before trying the download again, and 10 minutes after a second failure in a row; reinstalling the project's dependencies fixes the project's own CLI.",
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            "The registry could not be reached: you are offline, or a proxy blocks it. Astryx installs with npm, so set npm's `proxy`, `https-proxy`, or `registry` in your `.npmrc`, or add the CLI to the project and install its dependencies.",
            "The registry does not have it: a private registry without the Astryx packages. Point npm's registry for `@astryxdesign` at one that has them.",
            'The cache cannot be written: a read-only home folder, as in some containers. Point `XDG_CACHE_HOME` at a writable folder: {@link generic:ci-and-containers}.',
          ],
        },
      ],
    },
    {
      id: 'not-global',
      title: 'A global install that gets no update notice or agent guide',
      content: [
        {
          type: 'prose',
          text: "Astryx treats a copy as installed for your computer only when your package manager's own settings name its folder: npm's global prefix, Bun's `BUN_INSTALL`, Yarn's `global-folder`, pnpm's `PNPM_HOME`, or their defaults. A folder chosen only with a one-off flag, such as `{@pm-only yarn-classic \"uses the Yarn 1 global folder\" global add --global-folder ~/mine}`, is not in any setting, so Astryx treats that copy like a project's: no daily update check and no agent guide. Save the folder in your settings so Astryx knows it is a global install:",
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@pm-only yarn-classic "uses the Yarn 1 global folder" config set global-folder ~/mine}   # writes ~/.yarnrc\nexport BUN_INSTALL=~/mybun              # in your shell profile, for Bun',
        },
      ],
    },
    {
      id: 'core-offline',
      title: '"Core … could not be installed" outside a project',
      content: [
        {
          type: 'prose',
          text: "Outside a project, commands that read components (`component`, `search`, `template`, `build`, and the like) use your global version's Core. It ships beside the CLI only for some installs; otherwise your global install downloads it once into its cache in the background after a command you run online (on Windows, the first component command downloads it), and a component command before that, offline, fails with `ERR_VERSIONS_UNAVAILABLE`. Reinstalling the CLI does not help: run any command once online, and component reads work offline from then on. In CI nothing downloads in the background, so the first component command there needs the registry. The global-mode pages ({@link namespace:global}) read offline either way.",
        },
        {
          type: 'prose',
          text: "In a project with nothing installed yet, such as a fresh clone, the same commands use that Core too, and offline the error reads `This project has no Core installed, and Core <version> could not be downloaded`: install the project's dependencies (`{@pm install}`, or your package manager's), and the project's own Core answers from then on.",
        },
      ],
    },
    {
      id: 'unavailable',
      title: 'ERR_VERSIONS_UNAVAILABLE',
      content: [
        {
          type: 'prose',
          text: 'A run fails with `ERR_VERSIONS_UNAVAILABLE` only when nothing can answer: a command that needs Core outside a project cannot install it, or a version you requested exactly cannot be found.',
        },
      ],
    },
    {
      id: 'needs-a-project',
      title: 'Commands that need a project',
      content: [
        {
          type: 'code',
          lang: 'text',
          code: 'Error: No package.json found. Run this command inside an app project.\nError: No package.json found. Run this command inside an integration package.\nError: Could not find @astryxdesign/core package. Make sure you are inside the design system monorepo or have @astryxdesign/core installed.\nError: Could not find installed @astryxdesign/core (or legacy @xds/core). This folder is outside a project; upgrade migrates the code of an app project that installs @astryxdesign/core.',
        },
        {
          type: 'prose',
          text: "Commands that change an app or a package, such as `theme use`, `integration add`, `swizzle`, and `upgrade`, write nothing outside a project and say what they need. Run them in that project. Each command's doc says what it does outside a project ({@link namespace:commands}); a newer command that refuses uses `ERR_PROJECT_REQUIRED`.",
        },
      ],
    },
    {
      id: 'install-problems',
      title: 'Install problems',
      content: [
        {
          type: 'list',
          style: 'unordered',
          items: [
            '`npm i -g` fails with `EACCES` (permission denied): do not use `sudo`. Use a Node version manager, or give npm a global folder you own: `{@pm-only npm "moves the npm global folder" config set prefix ~/.npm-global}`, then add `~/.npm-global/bin` to your PATH.',
            '`astryx: command not found` after installing: your package manager\'s global bin folder is not on your PATH. `{@pm-only npm "prints the npm global folder" prefix -g}` shows npm\'s (its `bin` folder on macOS and Linux); `{@pm-only pnpm "sets up the pnpm global folder" setup}` adds pnpm\'s.',
            '`pnpm add -g` stops with `ERR_PNPM_NO_GLOBAL_BIN_DIR`, often with Corepack: run `{@pm-only pnpm "sets up the pnpm global folder" setup}`, open a new terminal, and try again. Yarn 2 and later have no `yarn global`; use `npm i -g` instead.',
            'Windows: npm puts `astryx.cmd` in `%APPDATA%\\npm`, which must be on your PATH. If PowerShell says running scripts is disabled, run `astryx.cmd`, or allow scripts for your user with `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.',
            'Two installs, and the wrong one runs: `{@command doctor}` outside a project lists every astryx command on your PATH, in the order your shell tries them.',
          ],
        },
      ],
    },
    {
      id: 'more',
      title: 'More on global mode',
      content: [
        {
          type: 'prose',
          text: 'This page is part of {@link namespace:global}, which explains what global mode is and how each part works.',
        },
      ],
    },
  ],
};
