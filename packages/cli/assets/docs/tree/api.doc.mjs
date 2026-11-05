// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs cli/api`: the programmatic API of `@astryxdesign/cli/api`.
 *
 * Adopts each function, schema, and enum doc whose `namespace` is `cli/api`,
 * one generated level per kind: `cli/api/functions`, `cli/api/schemas`, and
 * `cli/api/enums`.
 */

/** @type {import('@astryxdesign/cli/authoring').NamespaceDoc} */
export const docs = {
  type: 'namespace',
  name: 'api',
  title: 'API',
  summary:
    'The programmatic API: functions, the JSON output envelope, error codes, and response types.',
  keywords: ['api', 'functions', 'schemas', 'enums', 'json'],
  placement: {parent: 'namespace:cli', slot: 'reference', order: 20},
  slots: {
    kinds: {title: 'Reference', accepts: {kinds: ['namespace']}},
  },
  blocks: [
    {
      type: 'prose',
      text: 'To run the whole CLI from your own command-line tool, with its arguments, folder, and command name, use the host entry: {@link generic:host-entry}.',
    },
  ],
  adopts: [
    {
      source: {group: 'cli/api', kinds: ['function', 'schema', 'enum']},
      into: 'kinds',
      groupBy: 'kind',
    },
  ],
};
