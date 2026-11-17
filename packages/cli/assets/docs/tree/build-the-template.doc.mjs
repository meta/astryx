// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/templates/build-the-template`:
 * author portable template source and every asset that source needs.
 */

/** @type {import('@astryxdesign/cli/authoring').NamespaceDoc} */
export const docs = {
  type: 'namespace',
  name: 'build-the-template',
  placement: {parent: 'namespace:templates', slot: 'build', order: 30},
  title: 'Build the template',
  summary:
    'Make sure your template works when an app copies it: write the template file, set up its styles, fonts, icons, and images, then package and test it.',
  keywords: [
    'template source',
    'portable template',
    'template assets',
    'template imports',
  ],
  slots: {
    guides: {
      title: 'Guides',
      accepts: {kinds: ['generic', 'namespace']},
    },
  },
};
