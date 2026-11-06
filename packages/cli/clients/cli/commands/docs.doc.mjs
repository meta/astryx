// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for `astryx docs`. The terminal binding of the `docs()`
 * function (referenced via `fn`); its args/flags map to that function's params
 * so a converter can build Commander config + --help from one source of truth.
 * @position packages/cli/clients/cli/commands — command documentation
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'docs',
  displayName: 'astryx docs',
  namespace: 'cli/commands',
  summary: 'Print reference docs',
  description:
    'Reads the reference docs one level at a time: with no topic it lists every topic; a ' +
    'topic lists its sections, each with the key to read it by (a topic with one section ' +
    'prints whole); a topic plus a section prints that section; `--full` prints the whole ' +
    'topic, as does `--dense`. With `--json`, a topic returns its whole doc, as docs() ' +
    'does, and `--index` its section index. A route ' +
    'opens a node of the docs tree: `cli` lists its guides and reference, ' +
    '`cli/api/functions` lists every API function, and `cli/api/functions/search` prints ' +
    'one. A namespace plus a section prints that section from the one guide below it ' +
    'that has it (`{@command docs layout side-panels}`). `--depth` reads as far down the tree as you ask, from the doc alone (0) to ' +
    'everything below it (all), and with it `--detail` sets how much of each doc below ' +
    'shows: one line (brief, the default), its sections (compact), or all of it (full).',
  fn: 'docs',
  args: [
    {name: 'topic', param: 'topic', required: false},
    {name: 'section', param: 'section', required: false},
  ],
  options: [
    {
      flag: '--index',
      param: 'options.index',
      description: "List the topic's sections and their keys, even for a topic with one section",
    },
    {
      flag: '--full',
      description:
        'Print the whole topic instead of its sections (text; `--json` returns the whole topic unless --index). Cannot be set with --index',
    },
    {
      flag: '--depth <levels>',
      param: 'options.depth',
      description:
        'How many levels of the docs tree to read below a namespace: 0 for the namespace alone, 1 for its children (what a read without --depth shows), all for everything below it. With it, --detail sets how much of each doc below shows: brief (one line each, the default), compact (with its sections), or full',
    },
  ],
  examples: [
    {label: 'List topics', cli: 'astryx docs'},
    {label: "A topic's sections", cli: 'astryx docs theme'},
    {label: 'A whole topic as JSON', cli: 'astryx docs spacing --json'},
    {label: 'One section', cli: 'astryx docs theme quick-start'},
    {label: 'The CLI docs tree', cli: 'astryx docs cli'},
    {label: 'Every CLI doc, one line each', cli: 'astryx docs cli --depth all'},
    {
      label: 'The integration guides as one read',
      cli: 'astryx docs authoring --depth all --detail full',
    },
    {label: 'One API function', cli: 'astryx docs cli/api/functions/search'},
    {label: 'A whole guide', cli: 'astryx docs authoring/quick-start --full'},
  ],
  outsideProject: 'same',
  exitCodes: [
    {code: 0, when: 'success'},
    {
      code: 1,
      when: 'unknown topic or route, a section that matches no section or more than one, or a --depth that is not a number of levels or all',
    },
  ],
  related: ['search', 'component', 'hook', 'template'],
};
