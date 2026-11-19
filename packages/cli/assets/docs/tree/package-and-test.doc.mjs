// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/templates/build-the-template/package-and-test`:
 * expose a template from its package and prove the copied result in an app.
 */

/** @type {import('@astryxdesign/cli/authoring').NamespaceDoc} */
export const docs = {
  type: 'namespace',
  name: 'package-and-test',
  placement: {
    parent: 'namespace:build-the-template',
    slot: 'guides',
    order: 30,
  },
  title: 'Package and test',
  summary:
    'Publish a package that works the first time: include everything the template needs, check the package before you publish, and try the template in a real app.',
  keywords: [
    'template export',
    'package template',
    'integration verify',
    'test template',
  ],
  slots: {
    guides: {
      title: 'Guides',
      accepts: {kinds: ['generic']},
    },
  },
};
