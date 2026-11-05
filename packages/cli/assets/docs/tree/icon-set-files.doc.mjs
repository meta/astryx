// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs cli/experimental/icon-set-files`: every field of the
 * files an icon set is made of (the descriptor, the data file, and an icon
 * definition), one section each. Experimental (spec:AST-017 FR27): built
 * from the experimental authoring self-docs, which stable `astryx docs
 * authoring` never lists.
 */

import {buildExperimentalAuthoringSections} from '../../../foundation/discovery/authoring-self-docs.mjs';

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'icon-set-files',
  placement: {parent: 'namespace:experimental', slot: 'guides', order: 15},
  stability: 'experimental',
  title: 'Icon set files',
  category: 'guide',
  keywords: [
    'icon set doc',
    'icons.json',
    'icon set data',
    'icon definition doc',
    'IconSetDoc',
    'IconSetData',
    'IconDefinitionDoc',
  ],
  description:
    'Every field of the files an icon set is made of: the descriptor, the data file, and an icon definition.',
  sections: await buildExperimentalAuthoringSections(),
};
