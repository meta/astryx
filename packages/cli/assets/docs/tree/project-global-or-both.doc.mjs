// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs global/project-global-or-both`: which setup to use, project,
 * global, or both (recommended), with what each costs and how to set it up.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'project-global-or-both',
  placement: {
    parent: 'namespace:global',
    slot: 'guides',
    order: 1,
  },
  title: 'Project, global, or both',
  category: 'guide',
  keywords: [
    'which setup',
    'project or global',
    'global or project',
    'both',
    'install in project',
    'npx @astryxdesign/cli',
    'dev dependency',
    'recommended setup',
    'should i install globally',
  ],
  description:
    'Install Astryx in each project and once for your computer: both is the recommended setup, and the two never conflict. What each side gives you, and how to set it up.',
  sections: [
    {
      id: 'both',
      title: 'Both (recommended)',
      content: [
        {
          type: 'prose',
          text: 'Install the CLI in each project and once for your computer. Each side does something the other cannot, and they never conflict:',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            '**In the project**, the CLI version is pinned in `package.json` and the lockfile, so teammates and CI run exactly that version, with nothing fetched at run time.',
            '**Globally**, the astryx command works in every folder, including an empty one before a project exists, and every coding agent on your computer knows Astryx through its agent guide.',
            "**Together**, in a project the project's version always answers, even when you type the global astryx command; outside a project your global version does. Global mode never makes the project's CLI unnecessary.",
          ],
        },
      ],
    },
    {
      id: 'compare',
      title: 'At a glance',
      content: [
        {
          type: 'table',
          headers: ['Setup', 'What you get', 'What it costs', 'Who it is for'],
          rows: [
            [
              'Both',
              'A pinned version in each project, plus docs, components, and search in any folder, and an agent guide for every agent',
              'Two installs to keep current',
              'Most people',
            ],
            [
              'Project only',
              'A version pinned in the repo, the same for the team and CI',
              "No astryx command outside the project; agents elsewhere don't know Astryx",
              'CI machines and build servers',
            ],
            [
              'Global only',
              'Docs, components, and search in any folder; every agent knows Astryx',
              'Nothing pinned for a team; a project without its own CLI gets whatever version you started',
              'Agents, prototypes, and quick lookups',
            ],
          ],
        },
      ],
    },
    {
      id: 'set-up',
      title: 'How to set up each',
      content: [
        {
          type: 'prose',
          text: 'In the project folder (the getting-started guide lists the other packages an app installs):',
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@pm install @astryxdesign/core @astryxdesign/cli}\n{@command init}',
        },
        {
          type: 'prose',
          text: 'Once for your computer:',
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@pm install @astryxdesign/cli --global}',
        },
        {
          type: 'prose',
          text: 'For both, do both, in either order.',
        },
      ],
    },
    {
      id: 'what-happens',
      title: 'What happens when you have both',
      content: [
        {
          type: 'prose',
          text: "In a project, the project's version always answers, even when you type the global astryx command; outside a project, your global version does. {@link generic:who-answers}",
        },
      ],
    },
    {
      id: 'more',
      title: 'More on global mode',
      content: [
        {
          type: 'prose',
          text: 'This page is part of {@link namespace:global}, which explains what global mode is and how each part works. To start an app: {@link generic:getting-started}.',
        },
      ],
    },
  ],
};
