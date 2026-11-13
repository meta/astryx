// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'TabMenu',
  name: 'TabMenu',
  displayName: 'Tab Menu',
  description:
    'TabMenu is an overflow menu within a TabList that groups additional tab options into a dropdown, showing the selected option\'s label as the trigger text.',
  isReady: true,
  isShowcase: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['TabList', 'Tab', 'TabMenu'],
  fits: ['navigation'],
};
