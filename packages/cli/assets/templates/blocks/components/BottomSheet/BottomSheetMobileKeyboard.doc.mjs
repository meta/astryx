// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'BottomSheet',
  name: 'Bottom Sheet — Mobile keyboard',
  displayName: 'Bottom Sheet — Mobile keyboard',
  description:
    'Uses a tall, scrollable form that keeps focused controls visible above the mobile keyboard.',
  isReady: true,
  aspectRatio: 3 / 4,
  componentsUsed: [
    'BottomSheet',
    'Button',
    'Divider',
    'Heading',
    'Stack',
    'Text',
    'TextArea',
    'TextInput',
  ],
  fits: ['overlay', 'form'],
};
