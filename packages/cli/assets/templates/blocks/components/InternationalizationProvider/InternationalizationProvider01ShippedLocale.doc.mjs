// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'InternationalizationProvider',
  name: 'Load a shipped Astryx locale catalog',
  displayName: 'Internationalization Provider — Shipped Locale',
  registry: {slug: 'shipped-locale'},
  description:
    'Load a locale catalog shipped by Astryx and re-render InternationalizationProvider with a new locale to update Astryx strings live.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: [
    'InternationalizationProvider',
    'SegmentedControl',
    'Selector',
    'Layout',
  ],
};
