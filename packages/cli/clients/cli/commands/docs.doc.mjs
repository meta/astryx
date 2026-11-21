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
    'Reads the reference docs: with no topic it lists every topic; a topic prints whole, ' +
    'unless its whole text is over 16 KB, and then it lists its sections, each with the ' +
    'key to read it by; `--index` lists the sections of any topic, ' +
    'and `--full` prints any topic whole; a topic plus a section prints that section. With ' +
    '`--json`, a topic returns its whole doc, as docs() does, and `--index` its section ' +
    'index. A route ' +
    'opens a node of the docs tree: `cli` lists its guides and reference, ' +
    '`cli/api/functions` lists every API function, and `cli/api/functions/search` prints ' +
    'one. A namespace plus a section prints that section from the one guide below it ' +
    'that has it (`{@command docs layout side-panels}`). `--depth` reads as far down the tree as you ask, from the doc alone (0) to ' +
    'everything below it (all), and with it `--detail` sets how much of each doc below ' +
    'shows: one line (brief, the default), its sections (compact), or all of it (full). ' +
    '`skills` lists every Astryx skill (the project skill in a project, the computer-level skill, then each ' +
    'skill an integration declares), and `skills/<name>` prints one, when no doc holds that name.',
  fn: 'docs',
  args: [
    {name: 'topic', param: 'topic', required: false, names: 'topic'},
    {name: 'section', param: 'section', required: false},
  ],
  options: [
    {
      flag: '--list',
      param: 'options.list',
      description: 'List every topic (the same as giving no topic)',
    },
    {
      flag: '--index',
      param: 'options.index',
      description:
        "List the topic's sections and their keys instead of printing the topic",
    },
    {
      flag: '--full',
      description:
        'Print the whole topic, even one whose whole text is over 16 KB, which otherwise lists its sections (`--json` returns the whole topic unless --index). Cannot be set with --index',
    },
    {
      flag: '--depth <levels>',
      param: 'options.depth',
      description:
        'How many levels of the docs tree to read below a namespace: 0 for the namespace alone, 1 for its children (what a read without --depth shows), all for everything below it. On the topic list, where a namespace otherwise lists alone, it names the docs below each one by the route that opens them, one line each. With it on a namespace read, --detail sets how much of each doc below shows: brief (one line each, the default), compact (with its sections), or full; the topic list is one line per doc whatever the detail',
    },
  ],
  examples: [
    {label: 'List topics', cli: 'astryx docs'},
    {label: 'The same list, asked for by flag', cli: 'astryx docs --list'},
    {label: 'A topic', cli: 'astryx docs theme'},
    {label: "A topic's sections", cli: 'astryx docs theme --index'},
    {label: 'A whole topic as JSON', cli: 'astryx docs spacing --json'},
    {label: 'One section', cli: 'astryx docs theme quick-start'},
    {label: 'The CLI docs tree', cli: 'astryx docs cli'},
    {label: 'Every CLI doc, one line each', cli: 'astryx docs cli --depth all'},
    {
      label: 'Every route in the docs tree, one line each',
      cli: 'astryx docs --depth all',
    },
    {
      label: 'The integration guides as one read',
      cli: 'astryx docs authoring --depth all --detail full',
    },
    {label: 'One API function', cli: 'astryx docs cli/api/functions/search'},
    {label: 'A guide', cli: 'astryx docs authoring/quick-start'},
    {label: 'Every Astryx skill', cli: 'astryx docs skills'},
    {label: 'One skill, as agents read it', cli: 'astryx docs skills/astryx'},
  ],
  outsideProject: 'same',
  exitCodes: [
    {code: 0, when: 'success'},
    {
      code: 1,
      when: 'unknown topic or route, a section that matches no section or more than one, a --depth that is not a number of levels or all, or --list given a topic or section',
    },
  ],
  related: ['search', 'component', 'hook', 'template'],
};
