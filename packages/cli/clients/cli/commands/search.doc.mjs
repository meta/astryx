// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for `astryx search`. The terminal binding of the `search()`
 * function (referenced via `fn`); flags map to that function's params so a
 * converter can build Commander config + --help from one source of truth.
 * @position packages/cli/clients/cli/commands — command documentation
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'search',
  displayName: 'astryx search',
  namespace: 'cli/commands',
  summary: 'Search components, hooks, docs, templates, and themes in one ranked list',
  description:
    'Terminal front-end to search(): prints one ranked, greppable list across ' +
    'every content domain, each row carrying a follow-up command to act on it. ' +
    'Outside an app, where @astryxdesign/core is not installed, it searches the docs and themes.',
  fn: 'search',
  // Every word after `search` is the query: `astryx search dark mode` searches
  // for "dark mode", with no quotes needed.
  args: [{name: 'query', param: 'query', required: true, variadic: true}],
  options: [
    {
      flag: '--type <domain>',
      param: 'options.type',
      choices: ['component', 'hook', 'doc', 'template', 'theme'],
      description: 'Filter to one domain (component|hook|doc|template|theme)',
    },
    {
      flag: '--limit <n>',
      param: 'options.limit',
      description: 'Max number of results, a positive integer (default 20)',
    },
    {
      flag: '--verbose',
      description: "Also print each result's score and match reason",
    },
  ],
  examples: [
    {label: 'Ranked results', cli: 'astryx search button'},
    {
      label: 'Several words, no quotes',
      cli: 'astryx search dark mode --type doc',
    },
    {
      label: 'Filter + JSON',
      cli: 'astryx search "data table" --type template --json',
    },
    {label: 'Themes you can add', cli: 'astryx search warm --type theme'},
  ],
  outsideProject: 'same',
  exitCodes: [
    {code: 0, when: 'success (including zero matches)'},
    {
      code: 1,
      when: 'invalid --type, a --limit that is not a positive integer, or --type component, hook, or template where @astryxdesign/core cannot be found',
    },
  ],
  related: ['component', 'hook', 'docs', 'template', 'build'],
};
