// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Documentation Design',
  displayName: 'Documentation Design',
  description:
    "Reference article alternating prose with live rendered examples: an interactive preview, a property table, paired do and don't comparisons, and copyable code blocks.",
  keywords: [
    'documentation',
    'docs',
    'guide',
    'reference',
    'usage',
    'api entry',
  ],
  isReady: true,
  category: 'Content - Documentation Design',
  icons: {
    ArrowTopRightOnSquareIcon: 'externalLink',
    ArrowsPointingOutIcon: 'expand',
    PlusIcon: 'add',
  },
  slots: [
    {
      name: 'header',
      kind: 'header',
      description:
        'Top of the article: component name in display type, updated date, and a mobile section selector.',
    },
    {
      name: 'preview',
      kind: 'content',
      description:
        'Muted card below the header centering a large live interactive preview of the component.',
    },
    {
      name: 'usage',
      kind: 'content',
      description:
        'Usage heading with lead prose paragraph introducing when to use the component.',
    },
    {
      name: 'best-practices',
      kind: 'table',
      description:
        'Best practices table under the usage prose pairing Do and Dont badges with guidance text.',
    },
    {
      name: 'examples',
      kind: 'list',
      description:
        'Stack of example cards after the divider, each with title actions, live preview, and description or code tabs.',
    },
    {
      name: 'outline',
      kind: 'panel',
      description:
        'Sticky end-side panel labeled On this page with an outline linking to article sections.',
    },
  ],
};
