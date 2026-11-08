// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'Collapsible',
  name: 'Collapsible — Single Mode',
  displayName: 'Collapsible — Single Mode',
  description:
    'Only one section open at a time, so a single body of content competes for attention. Use defaultValue to pre-expand whichever section a first-time reader needs. Each Collapsible owns a Section, so its trigger is that section heading.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: [
    'Collapsible',
    'CollapsibleGroup',
    'Section',
    'Text',
    'Stack',
  ],
};
