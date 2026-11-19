// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs global/ci-and-containers`: Astryx in CI and containers: no
 * update checks, caching versions, read-only home folders (spec AST-081 FR6,
 * FR7, FR10).
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'ci-and-containers',
  placement: {
    parent: 'namespace:global',
    slot: 'guides',
    order: 8,
  },
  title: 'CI and containers',
  category: 'guide',
  keywords: [
    'ci',
    'github actions',
    'container',
    'docker',
    'read-only home',
    'cache the release cache',
    'agent machine',
    'restart',
    'ephemeral machine',
  ],
  description:
    "What Astryx does in CI and containers: no update checks or notices, the project's version as always, and how to cache versions or work with a read-only home folder.",
  sections: [
    {
      id: 'in-ci',
      title: 'In CI',
      content: [
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Most CI services set `CI=true`. When `CI` is set to anything but empty, `0`, or `false`, Astryx never checks for updates and never prints a notice; `CI=false`, `CI=0`, and an empty `CI` do not count. `NO_UPDATE_NOTIFIER`, set to anything, does the same anywhere.',
            "Add `@astryxdesign/cli` to the project as a devDependency at the same version as `@astryxdesign/core`; then CI runs the version pinned in the repo, and nothing is fetched. A global install in a CI image also works: in a project, it runs the project's version.",
            'Use `--json` for output a script reads; it never carries the answered-by line or a notice.',
          ],
        },
      ],
    },
    {
      id: 'cache',
      title: 'Cache project versions',
      content: [
        {
          type: 'prose',
          text: "When the project installs its own CLI and you install the project's dependencies first, there is nothing to cache. Astryx downloads into its cache only the CLI version a project whose own CLI cannot start needs, and, outside a project, the Core of a global install for commands that read components. In CI it downloads nothing in the background, so a global install in a CI image fetches that Core on its first component command. To skip those downloads on every run, cache this folder between runs:",
        },
        {
          type: 'table',
          headers: ['Linux', 'macOS', 'Windows'],
          rows: [
            [
              '`~/.cache/astryx` (or `$XDG_CACHE_HOME/astryx`)',
              '`~/Library/Caches/astryx`',
              '`%LOCALAPPDATA%\\astryx\\Cache`',
            ],
          ],
        },
      ],
    },
    {
      id: 'read-only',
      title: 'Read-only home folders',
      content: [
        {
          type: 'prose',
          text: "When the cache cannot be written, a project whose own CLI cannot start is answered by the global install, with a warning naming the folder. Point `XDG_CACHE_HOME` at a writable absolute path, or reinstall the project's dependencies. The global install's daily check and agent guide are skipped quietly when they cannot be written.",
        },
      ],
    },
    {
      id: 'short-lived',
      title: 'Machines that keep only the home folder',
      content: [
        {
          type: 'prose',
          text: 'Some agent machines keep the home folder across restarts but not system folders. A global install there disappears on restart while the agent guide in the home folder stays, so agents are told to run a global astryx command that is gone; the guide says to run the command that installed the CLI, such as `{@pm install @astryxdesign/cli --global}`, when that command is not found, and `astryx doctor` names the same step. To keep the CLI across restarts, install it into a folder in your home and put its `bin` folder on your PATH, as for a permission error ({@link generic:install-once}), or run that command when the machine starts.',
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
