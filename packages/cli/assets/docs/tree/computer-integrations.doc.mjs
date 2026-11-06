// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs global/computer-integrations`: integrations installed next to the
 * global install, where they work, and how to see them (spec AST-081 FR12).
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'computer-integrations',
  placement: {
    parent: 'namespace:global',
    slot: 'guides',
    order: 6,
  },
  title: 'Integrations installed globally',
  category: 'guide',
  keywords: [
    'global integration',
    'install an integration globally',
    'npm i -g integration',
    'integration outside a project',
    'installed for this computer',
  ],
  description:
    'Integrations installed next to your global install work in folders outside any project. Inside a project, only the integrations the project installs work, and the others are listed as ones you could add.',
  sections: [
    {
      id: 'install',
      title: 'Install one globally',
      content: [
        {
          type: 'prose',
          text: 'Install the integration the same way you installed the CLI, so the two sit side by side:',
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@pm install @astryxdesign/cli @acme/widgets --global}',
        },
        {
          type: 'prose',
          text: 'A tool that installs the CLI together with integrations in one folder, and runs the CLI from there, counts the same way. `npx` and the cache of project versions never count.',
        },
      ],
    },
    {
      id: 'outside',
      title: 'Outside a project, they work',
      content: [
        {
          type: 'prose',
          text: 'In a folder outside any project, Astryx loads each integration installed next to your global install the way a project loads its own: its components, templates, docs, themes, and discover source show up, and a command name it declares starts the commands Astryx prints. One whose `@astryxdesign/core` or `@astryxdesign/cli` peer range leaves out your global version is skipped, and `{@command doctor}` says why.',
        },
      ],
    },
    {
      id: 'inside',
      title: "Inside a project, only the project's",
      content: [
        {
          type: 'prose',
          text: "A project's answers must match what it installs: a component from a package it does not install would not build. So inside a project, an integration installed only globally adds nothing. `{@command discover}` lists it among the packages the project could add, with the project's install command, when it supports the project's version and loads. When the project installs the same integration, the project's copy is the one used.",
        },
      ],
    },
    {
      id: 'check',
      title: 'See which ones work',
      content: [
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Outside a project, `{@command doctor}` lists the global integrations it uses and warns about each it skips.',
            'Inside a project, `{@command doctor}` and `{@command discover}` list the ones the project could add.',
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
          text: 'This page is part of {@link namespace:global}, which explains what global mode is and how each part works. Building an integration: {@link generic:global-integrations}.',
        },
      ],
    },
  ],
};
