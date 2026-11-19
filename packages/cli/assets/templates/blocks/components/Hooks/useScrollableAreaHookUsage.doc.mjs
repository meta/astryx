// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useScrollableArea',
  name: 'useScrollableArea — Activity Log Panel',
  displayName: 'useScrollableArea — Activity Log Panel',
  description:
    'A fixed-height Activity log panel whose entries scroll up and down. useScrollableArea makes the panel a keyboard tab stop only when its entries overflow, reports which edges have more entries so a top or bottom shadow shows only there, and keeps a scroll that reaches the end from scrolling the page. Add entry flips the panel from not scrollable to scrollable.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Card', 'Button', 'Text', 'Layout'],
};
