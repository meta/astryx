// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'ChatComposer',
  name: 'ChatComposer — Full Featured',
  displayName: 'ChatComposer — Full Featured',
  description: 'Chat composer with all slots populated: collapsible attachment drawer, header actions, context progress bar, footer dropdown menus, and mic button. Shows the maximum composer configuration.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: [
    'ChatComposer',
    'Token',
    'Button',
    'DropdownMenu',
    'Icon',
    'ProgressBar',
    'Layout',
    'Text',
  ],
  icons: {
    AtSymbolIcon: 'mention',
    Cog6ToothIcon: 'settings',
    MicrophoneIcon: 'microphone',
    PaperClipIcon: 'attach',
    SparklesIcon: 'sparkles',
  },
};
