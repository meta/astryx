// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs global/uninstall`: uninstall the global install with each package
 * manager, remove the agent guide, and reset the cache and settings folders.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'uninstall',
  placement: {
    parent: 'namespace:global',
    slot: 'guides',
    order: 10,
  },
  title: 'Uninstall and reset',
  category: 'guide',
  keywords: [
    'uninstall',
    'remove',
    'reset astryx',
    'clear cache',
    'delete cache',
    'npm uninstall -g',
    'remove agent guide',
    'start over',
  ],
  description:
    'Remove your global install, the agent guide it keeps, and the folders it uses, or reset them to start over.',
  sections: [
    {
      id: 'agent-guide',
      title: 'First, remove the agent guide',
      content: [
        {
          type: 'prose',
          text: 'While the CLI is still installed, remove the agent guide from your home folder:',
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@command init --user --remove-agents}',
        },
        {
          type: 'prose',
          text: 'Or delete `~/.agents/skills/astryx` and the links to it listed in {@link generic:computer-agent-guide}.',
        },
      ],
    },
    {
      id: 'uninstall',
      title: 'Uninstall',
      content: [
        {
          type: 'code',
          lang: 'bash',
          code: '{@pm remove @astryxdesign/cli --global}\n# with Volta: volta uninstall @astryxdesign/cli',
        },
        {
          type: 'prose',
          text: 'Projects are unaffected: each keeps the CLI it installs, if any.',
        },
      ],
    },
    {
      id: 'reset',
      title: 'Reset',
      content: [
        {
          type: 'prose',
          text: 'Delete either folder to reset it; Astryx recreates what it needs on the next run.',
        },
        {
          type: 'table',
          headers: ['Folder', 'Linux', 'macOS', 'Windows'],
          rows: [
            [
              'Cache: versions for projects, saved discover answers',
              '`~/.cache/astryx`',
              '`~/Library/Caches/astryx`',
              '`%LOCALAPPDATA%\\astryx\\Cache`',
            ],
            [
              'Settings: update checks, the agent guide setting, and its links',
              '`~/.config/astryx`',
              '`~/Library/Application Support/astryx`',
              '`%APPDATA%\\astryx`',
            ],
          ],
        },
        {
          type: 'prose',
          text: 'On Linux, `XDG_CACHE_HOME` and `XDG_CONFIG_HOME` move them when set to absolute paths.',
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
