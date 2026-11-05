// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/templates/build-the-template/template-assets`:
 * make every style, font, icon, and media dependency survive a template copy.
 */

/** @type {import('@astryxdesign/cli/authoring').NamespaceDoc} */
export const docs = {
  type: 'namespace',
  name: 'template-assets',
  placement: {
    parent: 'namespace:build-the-template',
    slot: 'guides',
    order: 20,
  },
  title: 'Assets',
  summary:
    "Make sure the template's styles, fonts, icons, images, and video still show up after an app copies it.",
  blocks: [
    {
      type: 'prose',
      text: 'The copied file does not bring sibling assets with it ({@link generic:write-the-template-file}). Give every asset exactly one owner:',
    },
    {
      type: 'table',
      headers: ['Owner', 'Use when', 'How the copied source reaches it'],
      rows: [
        [
          'Copied source',
          'The value is small, editable, and belongs to the starting point',
          'Keep it in the `.tsx` file',
        ],
        [
          'Integration package',
          'The asset should stay centrally maintained with the package',
          'Import a stable public package path',
        ],
        [
          'App',
          'The app must provide product-specific content or branding',
          'Use an explicit placeholder or app public URL and say what to replace',
        ],
      ],
    },
    {
      type: 'prose',
      text: 'Do not make a template look self-contained while it relies on an undocumented package file or app convention.',
    },
  ],
  keywords: [
    'template assets',
    'template styles',
    'template fonts',
    'template icons',
    'template images',
  ],
  slots: {
    guides: {
      title: 'Guides',
      accepts: {kinds: ['generic']},
    },
  },
};
