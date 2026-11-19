// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs global/monorepos`: how a folder's project is found, in
 * workspaces and nested folders (spec AST-081 FR2).
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'monorepos',
  placement: {
    parent: 'namespace:global',
    slot: 'guides',
    order: 7,
  },
  title: 'Monorepos and nested folders',
  category: 'guide',
  keywords: [
    'monorepo',
    'workspace',
    'nested folder',
    'nested project',
    'subfolder',
    'packages folder',
    'which project',
    'yarn pnp',
    'hoisting',
  ],
  description:
    'How Astryx finds the project a folder belongs to, and which version answers in a monorepo, a nested app, or a cloned repository inside another project.',
  sections: [
    {
      id: 'find',
      title: 'How a project is found',
      content: [
        {
          type: 'prose',
          text: 'Astryx searches upward from the current folder: `@astryxdesign/core` or `@astryxdesign/cli` installed there or a few folders above, else the nearest `package.json` declaring either, up to the repository root. Folders without any are outside projects.',
        },
      ],
    },
    {
      id: 'workspaces',
      title: 'Workspaces',
      content: [
        {
          type: 'list',
          style: 'unordered',
          items: [
            'A workspace member declaring Astryx is its own project, even with packages hoisted to the repository root. A root CLI answers it, as always; a member with its own Core and no CLI anywhere gets answered by the astryx command you started.',
            'A folder without its own `package.json`, such as `src/` or `scripts/`, belongs to the project above it.',
            'A repository that builds the CLI itself, with the CLI in `packages/cli` next to Core in `packages/core`, runs that CLI.',
          ],
        },
      ],
    },
    {
      id: 'nested',
      title: 'Nested folders',
      content: [
        {
          type: 'list',
          style: 'unordered',
          items: [
            "Folders inside another project, such as nested apps or cloned repositories, answer with the enclosing project's release.",
            'Folder names compare as your file system compares them: a folder reached through a link, or typed in different letter case on macOS or Windows, answers like the folder itself.',
            "In a Yarn Plug'n'Play project, Astryx cannot see the project's own CLI, so the astryx command you started answers. Run the project's CLI through Yarn (`yarn astryx`) to use it directly.",
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
          text: 'Part of {@link namespace:global}: what global mode is and how each part works.',
        },
      ],
    },
  ],
};
