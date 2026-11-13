// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'DialogHeader',
  name: 'DialogHeader — Basic',
  displayName: 'DialogHeader — Basic',
  description:
    'A DialogHeader with a title, subtitle, and close button, placed in the header slot of a Dialog Layout. Pass onOpenChange to render the close button.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['Dialog', 'DialogHeader', 'Layout', 'LayoutContent', 'Text'],
  fits: ['overlay', 'header'],
};
