// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useKeyboardHint',
  name: 'useKeyboardHint — Arrow-key Hint',
  displayName: 'useKeyboardHint — Arrow-key Hint',
  description:
    'Toolbar shows an ephemeral "← → to navigate" hint on first keyboard focus via useKeyboardHint, teaching sighted keyboard users that arrows move within the group.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: [
    'Toolbar',
    'Button',
    'Icon',
    'Card',
    'Section',
    'Text',
    'Layout',
  ],
  icons: {BoldIcon: 'bold', ItalicIcon: 'italic', UnderlineIcon: 'underline'},
};
