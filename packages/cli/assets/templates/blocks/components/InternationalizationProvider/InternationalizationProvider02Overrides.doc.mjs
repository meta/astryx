// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'InternationalizationProvider',
  name: 'Change one Astryx string across your app',
  displayName: 'Internationalization Provider — Overrides',
  registry: {slug: 'overrides'},
  description:
    'Reword an Astryx string for every component under the provider, without a full locale catalog. One component rewords its own string through its prop, such as Selector placeholder.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['InternationalizationProvider', 'Selector', 'VStack'],
};
