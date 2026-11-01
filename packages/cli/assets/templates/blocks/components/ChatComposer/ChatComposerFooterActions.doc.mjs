// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'ChatComposer',
  name: 'ChatComposer — Footer Actions',
  displayName: 'ChatComposer — Footer Actions',
  description: 'Chat composer with dropdown menus for a model selector and settings in the footer, and a mic button in the send actions slot.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: [
    'ChatComposer',
    'Button',
    'DropdownMenu',
    'Icon',
    'Layout',
    'Text',
  ],
  icons: {
    Cog6ToothIcon: 'settings',
    MicrophoneIcon: 'microphone',
    SparklesIcon: 'sparkles',
  },
};
