// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useScrollOverflow',
  name: 'useScrollOverflow — Filter Strip Edge Fades',
  displayName: 'useScrollOverflow — Filter Strip Edge Fades',
  description:
    'A row of active filters that scrolls sideways. useScrollOverflow reports which edge has hidden filters, and the strip fades only that edge: none while every filter fits, the end at the start, both mid-scroll and the start at the end. Adding or removing a filter updates the fades, and in a right-to-left layout the start edge is on the right.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Token', 'Button', 'Switch', 'Layout'],
};
