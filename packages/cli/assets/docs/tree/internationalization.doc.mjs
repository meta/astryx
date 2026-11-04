// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs internationalization`: the internationalization namespace.
 * Groups guides for quick-start locale setup, library integration, and
 * RTL + testing.
 */

/** @type {import('@astryxdesign/cli/authoring').NamespaceDoc} */
export const docs = {
  type: 'namespace',
  name: 'internationalization',
  title: 'Internationalization',
  summary:
    'Set the active locale, load catalogs, coexist with your own i18n library, handle RTL, and test translations.',
  keywords: [
    'i18n',
    'internationalization',
    'locale',
    'translation',
    'RTL',
    'right-to-left',
    'language',
    'catalog',
  ],
  slots: {
    guides: {title: 'Guides', accepts: {kinds: ['generic']}},
  },
};
