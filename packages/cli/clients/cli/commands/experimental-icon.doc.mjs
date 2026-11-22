// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for `astryx experimental icon` (AST-084 FR6, FR7). The terminal binding
 * of the `icon()` function (referenced via `fn`).
 * @position packages/cli/clients/cli/commands — command documentation
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental icon',
  displayName: 'astryx experimental icon',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary:
    'Find an icon by meaning, or build an icon set from a library (guide: astryx docs cli/experimental/icon-sets)',
  description:
    "Terminal front-end to icon(): searches every installed icon set's data file by meaning and prints each match's import line, in the variant the project picks where the icon has it, and, when an icon meaning names the icon, the import that names it by that meaning (`meaningImport`). With no set installed, it names the icon meanings that match, built-in ones first, with the built-in that draws in place of a matching meaning Core does not draw (unless a match ranked above it has none), and how to get a set. `<set>/<id>` reads one icon with every variant's import line; --list lists the installed sets and how many icon meanings each one maps. The subcommands author a set: `new-set` starts one in an integration package, `new-meaning` adds the set's own icon meaning, `add` adds an icon from a library, `map` maps an icon meaning to an icon, and `use` makes a set the project's. Start a set with `new-set <name> --from <library>`; the guide is `astryx docs cli/experimental/icon-sets`. Experimental: it may change or be removed in a patch release.",
  fn: 'icon',
  // `new-set` and `new-meaning` start a set and its own meanings,
  // `add` adds an icon, `map` edits a map entry, and `use` picks the
  // project's icon set.
  subcommands: ['new-set', 'new-meaning', 'add', 'map', 'use'],
  // Every word after `icon` is the query: `astryx experimental icon arrow up`
  // searches for
  // "arrow up", with no quotes needed.
  args: [{name: 'query', param: 'query', required: false, variadic: true}],
  options: [
    {
      flag: '--list',
      param: 'options.list',
      description:
        'List the installed icon sets and do nothing else; a query is refused',
    },
    {
      flag: '--set <name>',
      param: 'options.set',
      description:
        'Search one set, by name or <package>/<set>; with --definitions, the set to check the meanings against',
    },
    {
      flag: '--limit <n>',
      param: 'options.limit',
      description: 'Max number of matches, a positive integer (default 10)',
    },
    {
      flag: '--definitions',
      param: 'options.definitions',
      description:
        "Every Astryx icon meaning, one line each: name, built in or not, how many bundled templates use it, whether the set maps it (--set, else the project's main set, else the package's only set), description, words",
    },
    {
      flag: '--all-icons',
      param: 'options.allIcons',
      description:
        'With --set and no words: every icon of that set, one line each (id, words, meanings)',
    },
  ],
  examples: [
    {label: 'Find by meaning', cli: 'astryx experimental icon delete'},
    {
      label: 'One icon and its variants',
      cli: 'astryx experimental icon outline/trash',
    },
    {label: 'Installed sets', cli: 'astryx experimental icon --list --json'},
    {
      label: 'Every icon of one set',
      cli: 'astryx experimental icon --set outline --all-icons',
    },
    {
      label: 'One set, top 3',
      cli: 'astryx experimental icon arrow --set outline --limit 3',
    },
  ],
  outsideProject: 'same',
  exitCodes: [
    {code: 0, when: 'success (including zero matches)'},
    {
      code: 1,
      when: 'no query and no --list, a query with --list, a --limit that is not a positive integer, or a set or icon that is not installed',
    },
  ],
  related: ['search', 'template'],
};
