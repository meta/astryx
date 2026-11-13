// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'Card',
  name: 'Card — Layout',
  displayName: 'Card — Layout',
  description: 'A card with a structured header, content area, and footer with action buttons. Use for forms, dialogs, or settings panels that need clear sections. Pair Card with Layout to get automatic dividers between header, content, and footer. The footer aligns actions to the right by default.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['Card', 'Layout', 'Button', 'Text'],
  fits: ['form', 'content'],
};
