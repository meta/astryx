// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'TabList',
  name: 'TabList \u2014 With Status Dot',
  displayName: 'TabList \u2014 With Status Dot',
  description:
    'Tabs with status dot indicators rendered via endContent to show live environment health at a glance.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['TabList', 'Tab', 'StatusDot'],
  fits: ['navigation'],
};
