// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'ResizeHandle',
  alsoExampleFor: ['useResizable'],
  name: 'Resizable — Collapsible with snap points',
  displayName: 'Resizable — Collapsible with snap points',
  description:
    'A collapsible sidebar with snap points, driven by useResizable. Dragging snaps to preset widths, dragging past the minimum collapses the panel, and the expand method restores it programmatically.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: [
    'Resizable',
    'ResizeHandle',
    'Layout',
    'LayoutPanel',
    'LayoutContent',
    'Card',
    'VStack',
    'Button',
    'Text',
  ],
  fits: ['panel'],
};
