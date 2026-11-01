// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs cli`: the top of the CLI's docs tree (spec:AST-046).
 *
 * A namespace declares a level and its slots. It never lists its children:
 * a guide places itself here with `placement`, and the `commands` and `api`
 * namespaces adopt the CLI's typed docs by the `namespace` group each declares.
 */

/** @type {import('@astryxdesign/cli/authoring').NamespaceDoc} */
export const docs = {
  type: 'namespace',
  name: 'cli',
  title: 'Astryx CLI',
  summary:
    'Commands, programmatic APIs, and output contracts. Building an integration is under {@link namespace:authoring}.',
  keywords: ['cli', 'commands', 'api', 'reference'],
  slots: {
    guides: {title: 'Guides', accepts: {kinds: ['generic', 'namespace']}},
    reference: {title: 'Reference', accepts: {kinds: ['namespace']}},
  },
  blocks: [
    {
      type: 'prose',
      text: 'Use the CLI in any folder: install it once for your computer, and every project still gets the release that matches its Core. See {@link namespace:global}.',
    },
  ],
};
