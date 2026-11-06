// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for `astryx build`. The terminal binding of the `build()`
 * function (referenced via `fn`); its args/flags map to that function's params
 * so a converter can build Commander config + --help from one source of truth.
 * @position packages/cli/clients/cli/commands — command documentation
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'build',
  displayName: 'astryx build',
  namespace: 'cli/commands',
  summary:
    'Build a page: the template to start from, or the workflow playbook (no query)',
  description:
    'The build-a-page entry point. With no query it returns the how-to-build-a-page ' +
    'playbook; with a query it names the page template to start from (always one: the ' +
    'closest page template, or the app shell when none matches), the next two templates, and the ' +
    'drop-in blocks and idea-specific components and hooks around it.',
  fn: 'build',
  args: [{name: 'query', param: 'query', required: false}],
  options: [
    {
      flag: '--type <domain>',
      param: 'options.type',
      choices: ['component', 'hook', 'template'],
      description: 'Filter the kit to one domain (component|hook|template)',
    },
    {
      flag: '--limit <n>',
      param: 'options.limit',
      description: 'Max candidates to draw from (default 60)',
    },
    {
      flag: '--verbose',
      description:
        'Verbose output (every block and component, full descriptions, import paths and match reason)',
    },
  ],
  examples: [
    {label: 'Get the playbook', cli: 'astryx build'},
    {
      label: 'Find the template to start from',
      cli: 'astryx build "analytics dashboard" --json',
    },
  ],
  outsideProject: 'same',
  exitCodes: [
    {code: 0, when: 'success (including zero matches)'},
    {
      code: 1,
      when: 'invalid --type, a --limit that is not a positive integer, or a query when @astryxdesign/core cannot be found (the playbook needs no core)',
    },
  ],
  related: ['search', 'template', 'component', 'hook', 'init'],
};
