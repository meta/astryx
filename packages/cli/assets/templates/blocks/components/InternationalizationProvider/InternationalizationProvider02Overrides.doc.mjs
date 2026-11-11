// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'InternationalizationProvider',
  name: 'Override one Astryx string',
  displayName: 'Internationalization Provider — Overrides',
  registry: {slug: 'overrides'},
  description:
    'Override a small number of Astryx strings without providing a full locale catalog.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['InternationalizationProvider', 'Selector'],
};
