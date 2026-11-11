// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'InternationalizationProvider',
  name: 'Show Calendar and DateInput in another calendar',
  displayName: 'Internationalization Provider — Calendar',
  registry: {slug: 'calendar'},
  description:
    'Set the `calendar` prop and the `Calendar` and `DateInput` inside the provider show that calendar system. The value stays a Gregorian ISO date. Japanese and Buddhist dates work in every browser; calendars such as Persian or Hebrew also need `Temporal` or a polyfill.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: [
    'InternationalizationProvider',
    'Calendar',
    'DateInput',
    'SegmentedControl',
    'Layout',
    'Text',
  ],
};
