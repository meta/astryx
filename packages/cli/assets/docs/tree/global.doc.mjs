// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs global`: global mode. What it is, how to install it, what you get,
 * and which version runs where; the parent of every global-mode page
 * (spec AST-081).
 */

/** @type {import('@astryxdesign/cli/authoring').NamespaceDoc} */
export const docs = {
  type: 'namespace',
  name: 'global',
  title: 'Global mode',
  summary:
    'Install Astryx once on your computer and use it in any folder. Each project still runs its own version of Astryx, so a global install never changes what a project gets.',
  keywords: [
    'global',
    'global mode',
    'globally',
    'global install',
    'npm i -g',
    'install globally',
    'install once',
    'any folder',
    'outside a project',
    'which version',
    'computer',
  ],
  slots: {
    guides: {
      title: 'Global mode, question by question',
      accepts: {
        kinds: ['generic'],
      },
    },
  },
  blocks: [
    {
      type: 'prose',
      text: "Global mode means installing the Astryx CLI once for your computer, so the astryx command works everywhere: in your projects, in an empty folder, and for every coding agent. Inside a project, the project's own version of Astryx answers, so your global install never changes what a project gets.",
    },
    {
      type: 'code',
      lang: 'bash',
      code: '{@pm install @astryxdesign/cli --global}',
    },
    {
      type: 'heading',
      level: 3,
      text: 'What you get',
    },
    {
      type: 'list',
      style: 'unordered',
      items: [
        'Docs, components, templates, and search in any folder, before you have a project.',
        'Every coding agent on your computer knows Astryx, through a short guide the CLI keeps where agent tools look.',
        "Each project keeps its own version: in a project, the project's version answers, whichever astryx command you run.",
      ],
    },
    {
      type: 'heading',
      level: 3,
      text: 'Which version runs',
    },
    {
      type: 'table',
      headers: ['Where you run it', 'Which version answers'],
      rows: [
        [
          'Inside a project',
          "The project's own CLI. In a project that installs only `@astryxdesign/core`, the astryx command you started, with a hint once a day to add the CLI.",
        ],
        ['Outside any project', 'Your global version.'],
        [
          'Commands for your computer, such as `{@command init --user}`',
          'Your global version, in any folder.',
        ],
      ],
    },
    {
      type: 'prose',
      text: 'Not sure whether you want a project install, a global one, or both: {@link generic:project-global-or-both}. The details: {@link generic:who-answers}.',
    },
    {
      type: 'heading',
      level: 3,
      text: 'Updates',
    },
    {
      type: 'prose',
      text: 'Your global install never upgrades itself or a project. When a newer version is out, a command that succeeds ends with a two-line notice, at most once a day: {@link generic:updates}.',
    },
    {
      type: 'heading',
      level: 3,
      text: 'Agents',
    },
    {
      type: 'prose',
      text: 'The CLI keeps a short Astryx guide where agent tools look in your home folder, so an agent working anywhere knows Astryx is there: {@link generic:computer-agent-guide}.',
    },
    {
      type: 'heading',
      level: 3,
      text: 'Integrations',
    },
    {
      type: 'prose',
      text: "Integrations you install next to your global install work outside projects. Inside a project, only the project's own integrations do: {@link generic:computer-integrations}. Building one: {@link generic:global-integrations}.",
    },
    {
      type: 'heading',
      level: 3,
      text: 'More',
    },
    {
      type: 'list',
      style: 'unordered',
      items: [
        'Install, and work offline: {@link generic:install-once}.',
        'Monorepos and nested folders: {@link generic:monorepos}.',
        'CI and containers: {@link generic:ci-and-containers}.',
        'Something looks wrong: {@link generic:problems}.',
        'Uninstall and reset: {@link generic:uninstall}.',
        'Every path, setting, JSON field, and error code: {@link generic:reference}.',
        'What each command does outside a project: {@link namespace:commands}.',
      ],
    },
  ],
};
