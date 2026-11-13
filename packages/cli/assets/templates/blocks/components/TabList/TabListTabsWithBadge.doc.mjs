// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'TabList',
  name: 'TabList \u2014 With Badge',
  displayName: 'TabList \u2014 With Badge',
  description:
    'Tabs with notification badge counts rendered via endContent. Uses error variant for urgent counts and neutral for informational ones.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['TabList', 'Tab', 'Badge'],
  fits: ['navigation'],
};
