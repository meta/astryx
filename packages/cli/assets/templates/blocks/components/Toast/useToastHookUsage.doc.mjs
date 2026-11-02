// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useToast',
  name: 'useToast — Settings Saved',
  displayName: 'useToast — Settings Saved',
  description:
    'A settings form that calls the function from useToast on Save: a "Settings saved" toast with an Undo action, a uniqueID so pressing Save again replaces the toast instead of stacking another, and an error toast when the save fails.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Toast', 'Card', 'TextInput', 'Switch', 'Button', 'Layout'],
};
