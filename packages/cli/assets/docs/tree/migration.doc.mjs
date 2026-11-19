// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs migration`: the migration namespace. Groups the
 * incremental migration guides: setup (theme, CSS, layers), component
 * replacement, and verification.
 */

/** @type {import('@astryxdesign/cli/authoring').NamespaceDoc} */
export const docs = {
  type: 'namespace',
  name: 'migration',
  title: 'Migration',
  summary:
    'Migrate an existing Tailwind, shadcn, or Radix app to the design system incrementally — setup, component replacement, and verification.',
  keywords: [
    'migration',
    'migration guide',
    'migrate',
    'Tailwind',
    'shadcn',
    'Radix',
    'coexistence',
  ],
  slots: {
    guides: {title: 'Guides', accepts: {kinds: ['generic']}},
  },
};
