// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file astryx docs authoring/building-blocks — the kinds you can add. */

/** @type {import('@astryxdesign/cli/authoring').NamespaceDoc} */
export const docs = {
  type: 'namespace',
  name: 'building-blocks',
  placement: {parent: 'namespace:authoring', slot: 'guides', order: 20},
  title: 'Building Blocks',
  summary:
    'Add components, templates, themes, docs, and codemods, and configure how it behaves.',
  keywords: [
    'building blocks',
    'contribute',
    'add to an integration',
    'contribution kinds',
  ],
  slots: {
    guides: {
      title: 'Building Blocks',
      accepts: {kinds: ['generic', 'namespace']},
    },
  },
  blocks: [
    {
      type: 'prose',
      text: 'In global mode: every kind your package adds also applies outside projects when users install it for their computer, beside the global CLI; inside a project, only if the project installs it. See {@link namespace:global} and {@link generic:global-integrations}.',
    },
    {
      type: 'prose',
      text: 'These are everything you can add to an integration. Mix them however you like. You are not limited to any one thing.',
    },
    {
      type: 'list',
      style: 'unordered',
      items: [
        'One component, or a whole library of them.',
        'Components together with themes and templates.',
        'Only docs, if that is all you need.',
        'Agent guidance, so the AI agents in an app follow your library.',
        'Codemods that update app code across your breaking changes.',
      ],
    },
    {
      type: 'prose',
      text: 'Each kind below is its own guide. Open one to learn, in depth, how to add it and how to keep it healthy as your package grows.',
    },
  ],
};
