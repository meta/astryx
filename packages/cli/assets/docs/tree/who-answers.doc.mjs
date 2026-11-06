// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs global/who-answers`: which version answers in each folder, the
 * hand-off, and how to see who answered (spec AST-081 FR2, FR3, FR5, FR9).
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'who-answers',
  placement: {
    parent: 'namespace:global',
    slot: 'guides',
    order: 3,
  },
  title: 'Which version runs, and why',
  category: 'guide',
  keywords: [
    'which release',
    'wrong version',
    'different version',
    'answered by',
    'answeredBy',
    'hand-off',
    'handed over',
    'project version',
  ],
  description:
    "Inside a project, the project's own CLI answers, whichever astryx command you start; in a project with only Core, the astryx command you started answers. Outside a project, your global install answers. How to see which one did.",
  sections: [
    {
      id: 'in-a-project',
      title: "In a project, the project's version",
      content: [
        {
          type: 'list',
          style: 'unordered',
          items: [
            "The project installs the CLI, as recommended: that CLI answers, whatever its version, as it always has. When you type the global astryx command instead, it passes the run to the project's CLI, with the same arguments, input, output, and exit status, so either command gives the same answer.",
            "The project installs only Core, or nothing is installed yet, as in a fresh clone: the astryx command you started answers, as it always has. When its version differs from the project's Core, a hint after the command, once a day, names the command that adds the CLI at Core's version.",
            "The project's CLI is installed but cannot start: the CLI version equal to the project's Core answers instead (from the installed Core, else the lockfile, else the newest one the declared range allows), installed once into a cache.",
          ],
        },
        {
          type: 'prose',
          text: "Components come from `@astryxdesign/core`, and templates, docs, and agent guides come from the CLI. In a project, that Core is the one the project installs, so component commands work offline once the project's dependencies are installed. Outside a project, or in a project with nothing installed yet (a fresh clone), they use the answering version's own Core, from beside the CLI or the cache; when that Core cannot be downloaded, the error says to install the project's dependencies. When the project's CLI and Core are different versions, `{@command doctor}` warns and prints the command that brings them to one version.",
        },
      ],
    },
    {
      id: 'outside',
      title: 'Outside a project, your global install',
      content: [
        {
          type: 'prose',
          text: 'In a folder that belongs to no project, your global install answers as a brand-new project on its version would, so you and your agents can read every component and doc. It never installs a newer version by itself.',
        },
        {
          type: 'prose',
          text: 'A few commands work on your computer rather than a folder, such as `{@command init --user}`: your global install answers them in any folder.',
        },
      ],
    },
    {
      id: 'see-it',
      title: 'See which version answered',
      content: [
        {
          type: 'prose',
          text: 'In a project with only Core, the hint looks like this, after the command, at most once a day per project:',
        },
        {
          type: 'code',
          lang: 'text',
          code: 'astryx: this project has no Astryx CLI installed; answered by CLI 0.7.2 while its Core is 0.6.8. To match, run: npm install @astryxdesign/cli@0.6.8',
        },
        {
          type: 'prose',
          text: "Otherwise, in text mode, one line on standard error names the version, unless the project's own CLI answered directly:",
        },
        {
          type: 'code',
          lang: 'text',
          code: "astryx: answered by this project's CLI 0.6.8, handed over from CLI 0.7.2\nastryx: answered by CLI 0.6.8 with Core 0.6.8, the release that matches this project's Core\nastryx: answered by CLI 0.7.2 with Core 0.7.2, outside a project\nastryx: answered by CLI 0.7.2 with Core 0.7.2, for this computer",
        },
        {
          type: 'prose',
          text: 'With `--json` nothing extra prints; every result carries `meta.answeredBy` instead ({@link generic:reference}):',
        },
        {
          type: 'code',
          lang: 'json',
          code: '{"meta": {"answeredBy": {"cli": "0.7.2", "core": "0.6.8", "copy": "starting"}}}',
        },
      ],
    },
    {
      id: 'printed-commands',
      title: 'Commands Astryx prints',
      content: [
        {
          type: 'prose',
          text: "Commands the CLI prints for you to run start with a name that reaches the same version: the project's runner (such as `pnpm exec astryx`) in a project, `astryx` outside a project when your global install answered, and otherwise the CLI pinned to the version, such as `{@pm dlx @astryxdesign/cli@0.6.8}`. An integration can name its own command: {@link generic:cli-command}.",
        },
      ],
    },
    {
      id: 'more',
      title: 'More on global mode',
      content: [
        {
          type: 'prose',
          text: 'This page is part of {@link namespace:global}, which explains what global mode is and how each part works. To check your computer, run `{@command doctor}` outside any project ({@link command:doctor}). Monorepos: {@link generic:monorepos}.',
        },
      ],
    },
  ],
};
