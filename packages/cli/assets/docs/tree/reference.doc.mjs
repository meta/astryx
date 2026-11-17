// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs global/reference`: every folder, environment variable, JSON
 * field, and error code of global mode, and a short glossary (spec AST-081).
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'reference',
  placement: {
    parent: 'namespace:global',
    slot: 'guides',
    order: 11,
  },
  title: 'Global mode reference',
  category: 'guide',
  keywords: [
    'reference',
    'paths',
    'folders',
    'environment variables',
    'env vars',
    'XDG_CACHE_HOME',
    'XDG_CONFIG_HOME',
    'LOCALAPPDATA',
    'APPDATA',
    'meta.available',
    'error codes',
    'glossary',
    'state.json',
    'settings.json',
  ],
  description:
    'Every folder global mode uses on each system, the environment variables it reads, the JSON fields it adds, its error codes, and a short glossary.',
  sections: [
    {
      id: 'paths',
      title: 'Folders and files',
      content: [
        {
          type: 'table',
          headers: ['What', 'Linux', 'macOS', 'Windows'],
          rows: [
            [
              'Cache folder',
              '`~/.cache/astryx` (or `$XDG_CACHE_HOME/astryx`)',
              '`~/Library/Caches/astryx`',
              '`%LOCALAPPDATA%\\astryx\\Cache`',
            ],
            [
              'Versions for projects',
              '`<cache>/releases/<version>`',
              '`<cache>/releases/<version>`',
              '`<cache>\\releases\\<version>`',
            ],
            [
              'Settings folder',
              '`~/.config/astryx` (or `$XDG_CONFIG_HOME/astryx`)',
              '`~/Library/Application Support/astryx`',
              '`%APPDATA%\\astryx`',
            ],
            [
              'Update checks and notices, and why the last notice or check did not happen (for `{@command doctor}` only)',
              '`<settings>/state.json`',
              '`<settings>/state.json`',
              '`<settings>\\state.json`',
            ],
            [
              'Agent guide setting, and the links Astryx made',
              '`<settings>/settings.json`',
              '`<settings>/settings.json`',
              '`<settings>\\settings.json`',
            ],
            [
              'Agent guide',
              '`~/.agents/skills/astryx/SKILL.md`, linked from `~/.claude/skills/astryx` and others',
              'the same',
              'the same, under `%USERPROFILE%`',
            ],
          ],
        },
        {
          type: 'prose',
          text: 'Every folder the agent guide is linked into: {@link generic:computer-agent-guide}.',
        },
      ],
    },
    {
      id: 'env',
      title: 'Environment variables',
      content: [
        {
          type: 'table',
          headers: ['Variable', 'Effect'],
          rows: [
            [
              '`CI`',
              'Set to anything but empty, `0`, or `false`: no update check and no notice.',
            ],
            [
              '`NO_UPDATE_NOTIFIER`',
              'Set to anything: no update check and no notice.',
            ],
            [
              '`XDG_CACHE_HOME`, `XDG_CONFIG_HOME`',
              'On Linux, move the cache and settings folders; used only when absolute.',
            ],
            [
              '`LOCALAPPDATA`, `APPDATA`',
              'On Windows, the cache and settings folders; used only when absolute.',
            ],
          ],
        },
        {
          type: 'prose',
          text: "Astryx reads no environment variable of its own. npm's own settings, such as its registry and proxy, apply to the versions it installs for projects.",
        },
      ],
    },
    {
      id: 'json',
      title: 'JSON fields',
      content: [
        {
          type: 'list',
          style: 'unordered',
          items: [
            "`meta.answeredBy` on every successful `--json` result: `cli` (the version that answered), `core` (the Core it used, or `null`), and `copy`: `project` (the project's own CLI), `starting` (the astryx command you started, in a project with no CLI of its own), `matched` (the CLI version equal to the project's Core, when the project's own CLI cannot start), `carried` (outside a project), or `fallback` (that version could not be obtained, so the astryx command you started answered instead).",
            '`meta.available` entries from `{@command discover}` with `source: "installed for this computer"`: an integration installed next to your global install that the project could add, with its install command in `install`.',
          ],
        },
      ],
    },
    {
      id: 'errors',
      title: 'Error codes',
      content: [
        {
          type: 'list',
          style: 'unordered',
          items: [
            '`ERR_VERSIONS_UNAVAILABLE`: nothing can answer, such as a command that needs Core outside a project that cannot install it. When only the matching version is missing, the run answers anyway, with a warning. {@link generic:problems}',
            '`ERR_PROJECT_REQUIRED`: a command that only works in a project ran outside one. Commands released before global mode keep the codes they already used: `theme use`, `theme remove`, and `theme add <slug>` use `ERR_THEME_INVALID`, `integration add` uses `ERR_FILE_NOT_FOUND`, `swizzle` uses `ERR_CORE_NOT_FOUND`, and `upgrade` uses `ERR_VERSION_DETECT`.',
          ],
        },
      ],
    },
    {
      id: 'changes',
      title: 'What changes in global mode',
      content: [
        {
          type: 'list',
          style: 'unordered',
          items: [
            "Which version answers: in a project, the project's own CLI (with only Core, the astryx command you started); outside one, your global version. {@link generic:who-answers}",
            'Commands that change a project write nothing outside one; `doctor`, `init`, and `theme add` do something else there. {@link namespace:commands}',
            'Integrations installed globally work only outside projects. {@link generic:computer-integrations}',
            'The programmatic API runs in your process with the package you import and never hands off to another version; with `cwd` outside a project, its functions answer as the commands do there. {@link namespace:api}',
          ],
        },
      ],
    },
    {
      id: 'glossary',
      title: 'Glossary',
      content: [
        {
          type: 'list',
          style: 'unordered',
          items: [
            '**Global install**: the CLI installed for your computer with `npm i -g` or another package manager.',
            "**The project's version**: the project's own CLI; it answers every command in that project. A project with only Core has none, so the astryx command you started answers.",
            '**Cache**: the folder where Astryx keeps versions projects need but do not install.',
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
