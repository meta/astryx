// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs styling`: the styling namespace. Groups guides for
 * styling basics (xstyle, className, rest props), advanced patterns
 * (compounds, data attrs, deprecated), and tokens + StyleX setup.
 */

/** @type {import('@astryxdesign/cli/authoring').NamespaceDoc} */
export const docs = {
  type: 'namespace',
  name: 'styling',
  title: 'Styling components',
  summary:
    'Customize component appearance: xstyle, Tailwind, className, rest props, compound components, data attribute selectors, tokens, and StyleX setup.',
  keywords: [
    'styling',
    'xstyle',
    'className',
    'override',
    'customize',
    'css',
    'StyleX',
    'tokens',
  ],
  slots: {
    guides: {title: 'Guides', accepts: {kinds: ['generic']}},
  },
};
