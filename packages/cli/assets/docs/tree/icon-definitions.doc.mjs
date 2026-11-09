// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs cli/experimental/icon-definitions`: every icon
 * definition, Astryx's and, in a project that sets `experimental.iconSet`,
 * each installed icon set's own. Experimental
 * (spec:AST-017 FR27), with the icon sets that use them.
 *
 * It never lists its children: it adopts every icon definition doc from every
 * package, so a new definition file appears here with no edit to this file.
 */

/** @type {import('@astryxdesign/cli/authoring').NamespaceDoc} */
export const docs = {
  type: 'namespace',
  name: 'icon-definitions',
  placement: {parent: 'namespace:experimental', slot: 'guides', order: 20},
  stability: 'experimental',
  title: 'Icon definitions',
  summary:
    'Every icon definition: what an icon stands for, and the shared name icon sets map their icons to.',
  keywords: [
    'icon definition',
    'icon definitions',
    'icon names',
    'which icon',
    'icon map',
  ],
  slots: {
    definitions: {title: 'Definitions', accepts: {kinds: ['icon-definition']}},
  },
  adopts: [
    {
      source: {
        group: 'icon-definitions',
        kinds: ['icon-definition'],
        packages: 'all',
      },
      into: 'definitions',
    },
  ],
  blocks: [
    {
      type: 'prose',
      text: "An icon definition is one thing an icon stands for, such as `close` or `delete`. Every icon set registers its icons against definitions in its data file's `map`, and templates are written against definitions, so a project that switches icon sets gets the same definition from the new set. Built-in definitions, marked [built-in], are the shared names Core renders (the semantic icon names in `astryx docs icons`); every set maps them, and `integration check` fails until it does. The others are optional: map each one your library draws. `map` keys a definition by its camelCase name, shown after the id (`eyeSlash`); `experimental icon map` and `--pairs` take either spelling. A set may add its own definitions; in a project that sets `experimental.iconSet`, they are listed here with the package that ships them. `astryx experimental icon <definition>` finds the icon each installed set draws for it. Icon definitions are experimental: they may change or be removed in a patch release.",
    },
  ],
};
