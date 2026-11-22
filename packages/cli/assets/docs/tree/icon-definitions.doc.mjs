// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs cli/experimental/icon-definitions`: every icon
 * definition, Astryx's and, in a project that installs an icon-set package
 * or sets `experimental.iconSet`, each installed icon set's own. Experimental
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
  title: 'Icon meanings',
  summary:
    'Every icon meaning: what an icon stands for, and the shared name icon sets map their icons to.',
  keywords: [
    'icon definition',
    'icon definitions',
    'icon names',
    'which icon',
    'icon map',
  ],
  slots: {
    definitions: {title: 'Meanings', accepts: {kinds: ['icon-definition']}},
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
      text: "An icon meaning is one thing an icon stands for, such as `close` or `delete`. Every icon set registers its icons against meanings in its data file's `map`, and templates are written against meanings, so a project that switches icon sets gets the same meaning from the new set. Built-in meanings, marked [built-in], are the shared names Core renders (the built-in meanings in `astryx docs icons`); every set maps them, and `integration check` fails until it does. The others are optional: map each one your library draws. `map` keys a meaning by its camelCase name, shown after the id (`eyeSlash`); `experimental icon map` and `--pairs` take either spelling. A set may add its own meanings; once its package is installed, they are listed here with the package that ships them. `astryx experimental icon <meaning>` finds the icon each installed set draws for it. Icon meanings are experimental: they may change or be removed in a patch release.",
    },
  ],
};
