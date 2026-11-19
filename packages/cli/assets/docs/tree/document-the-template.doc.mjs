// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/templates/document-the-template`:
 * document page and block templates for discovery and correct reuse.
 */

/** @type {import('@astryxdesign/cli/authoring').NamespaceDoc} */
export const docs = {
  type: 'namespace',
  name: 'document-the-template',
  placement: {parent: 'namespace:templates', slot: 'build', order: 20},
  title: 'Document the template',
  summary:
    'Write the doc that helps people and agents find, choose, and trust your template: its name, description, readiness, preview, and any Core replacement.',
  keywords: [
    'template doc',
    'template documentation',
    'page template',
    'block template',
  ],
  slots: {
    guides: {
      title: 'Guides',
      accepts: {kinds: ['generic']},
    },
  },
};
