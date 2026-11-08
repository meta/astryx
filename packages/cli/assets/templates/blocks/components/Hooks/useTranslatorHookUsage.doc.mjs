// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useTranslator',
  name: 'useTranslator — Load More Footer',
  displayName: 'useTranslator — Load More Footer',
  description:
    'A "Load more" footer under a list that gets its button label and its "Showing 3 of 9" count from the function useTranslator returns, with app message keys supplied per locale through InternationalizationProvider, so switching the provider to French changes both strings.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: [
    'InternationalizationProvider',
    'Card',
    'SegmentedControl',
    'List',
    'Text',
    'Button',
    'Layout',
  ],
};
