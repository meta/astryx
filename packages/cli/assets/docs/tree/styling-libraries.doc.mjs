// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs styling-libraries`: the styling-libraries namespace.
 * Groups guides for CSS/StyleX, Tailwind, other semantic-token libraries,
 * and non-CSS token processing.
 */

/** @type {import('@astryxdesign/cli/authoring').NamespaceDoc} */
export const docs = {
  type: 'namespace',
  name: 'styling-libraries',
  title: 'Other styling libraries',
  summary:
    'Integrate Tailwind, StyleX, Panda, Chakra, MUI, CSS-in-JS, CSS Modules, and non-CSS renderers with system tokens.',
  keywords: [
    'Tailwind',
    'StyleX',
    'Panda',
    'Chakra',
    'MUI',
    'Emotion',
    'styled-components',
    'CSS Modules',
    'interop',
    'styling library interop',
  ],
  slots: {
    guides: {title: 'Guides', accepts: {kinds: ['generic']}},
  },
};
