// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  type: 'function',
  name: 'useToast',
  displayName: 'useToast',
  group: 'Toast',
  params: [
    {
      name: 'options',
      type: 'ToastOptions',
      description: 'Default placement and duration.',
      required: false,
    },
  ],
  returns: [
    {
      name: 'show',
      type: '(message: string) => void',
      description: 'Shows a toast.',
    },
  ],
  usage: {description: 'Show a short message that dismisses itself.'},
};
