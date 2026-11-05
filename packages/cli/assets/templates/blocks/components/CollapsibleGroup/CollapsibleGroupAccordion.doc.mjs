// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'CollapsibleGroup',
  name: 'CollapsibleGroup — Density',
  displayName: 'CollapsibleGroup — Density',
  registry: {aliases: ['collapsible-group/accordion']},
  description:
    "density sets the block padding on every row in the group, so a list of sections can be tuned to the surface it sits on without touching the rows. compact for dense surfaces like sidebars and inspectors, balanced (the default) for page content, spacious for a short list that is the main thing on the page. It follows Table's scale and pairs with hasDividers, which turns it on at balanced.",
  isReady: true,
  aspectRatio: 3 / 4,
  componentsUsed: ['CollapsibleGroup', 'Collapsible', 'Text', 'Stack'],
};
