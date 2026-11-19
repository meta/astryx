// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs cli/commands`: every command the CLI ships.
 *
 * Adopts each command doc whose `namespace` is `cli/commands`, so a new
 * command appears here with no edit to this file.
 */

/** @type {import('@astryxdesign/cli/authoring').NamespaceDoc} */
export const docs = {
  type: 'namespace',
  name: 'commands',
  title: 'Commands',
  summary:
    'Every command and subcommand: usage, options, examples, exit codes, and what it does outside a project.',
  keywords: ['commands', 'usage', 'options', 'flags'],
  placement: {parent: 'namespace:cli', slot: 'reference', order: 10},
  slots: {
    commands: {title: 'Commands', accepts: {kinds: ['command']}},
  },
  adopts: [
    {source: {group: 'cli/commands', kinds: ['command']}, into: 'commands'},
  ],
  blocks: [
    {
      type: 'prose',
      text: "In global mode: each command declares its behavior outside projects (`outsideProject`). Most answer like a new project; some write nothing and name the project they need; `doctor`, `init`, and `upgrade` behave differently. Commands with different behavior describe it in their `In global mode:` note, and CLI tests run each command in an empty folder against its declared value. Inside a project, the project's Astryx release runs every command, whichever astryx command you type. See {@link namespace:global}.",
    },
  ],
};
