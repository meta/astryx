// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/components`: guides for adding and
 * documenting components in an integration package.
 */

/** @type {import('@astryxdesign/cli/authoring').NamespaceDoc} */
export const docs = {
  type: 'namespace',
  name: 'components',
  placement: {parent: 'namespace:building-blocks', slot: 'guides', order: 10},
  title: 'Components',
  summary:
    'Add components to an integration, document their public contract, and make them work in every app that installs the package.',
  keywords: ['integration component', 'ship a component', 'component docs'],
  slots: {
    guides: {
      title: 'Components',
      accepts: {kinds: ['generic', 'namespace']},
    },
  },
  blocks: [
    {
      type: 'prose',
      text: 'In global mode: components from an integration installed for the computer show up outside projects; inside a project, only components from integrations the project installs. See {@link namespace:global} and {@link generic:global-integrations}.',
    },
  ],
};
