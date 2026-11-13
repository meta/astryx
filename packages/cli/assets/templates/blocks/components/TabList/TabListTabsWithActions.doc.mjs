// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'TabList',
  name: 'TabList — With Actions',
  displayName: 'TabList — With Actions',
  description:
    'Page header pattern with tabs on the left and action buttons pushed to the right. When hasDivider is true, match the Button size to the TabList size so the tabs and actions align to a shared baseline above the divider.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['TabList', 'Tab', 'Button'],
  fits: ['navigation', 'header', 'toolbar'],
};
