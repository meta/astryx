// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useToast',
  name: 'useToast — Settings Saved',
  displayName: 'useToast — Settings Saved',
  description:
    'Shows a toast from the function useToast returns: a "Settings saved" confirmation with an Undo action, a uniqueID so pressing the button again replaces the toast instead of stacking another, and an error toast when the request fails.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Toast', 'Card', 'TextInput', 'Switch', 'Button', 'Layout'],
};
