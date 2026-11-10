// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'BaseTypeahead',
  name: 'BaseTypeahead — Menu',
  displayName: 'BaseTypeahead — Menu',
  description:
    "A filter field built on BaseTypeahead's `menu`. The listbox role puts a heading and a key hint around the result list, and keeps every action a result. Picking a field switches the same menu to a dialog role that edits the value; `handleRef.open()` reopens it from a filter button, and Escape returns focus to that button.",
  isReady: true,
  isShowcase: false,
  aspectRatio: 16 / 9,
  componentsUsed: [
    'BaseTypeahead',
    'Button',
    'Icon',
    'Layout',
    'RadioList',
    'Text',
  ],
  icons: {FunnelIcon: 'funnel'},
};
