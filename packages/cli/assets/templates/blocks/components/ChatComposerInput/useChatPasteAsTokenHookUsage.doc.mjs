// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useChatPasteAsToken',
  name: 'useChatPasteAsToken — Long paste',
  displayName: 'useChatPasteAsToken — Long paste',
  description:
    'A composer whose pasteAsToken comes from useChatPasteAsToken with a threshold of 40 and a Pasted note label. A paste of 41 to 200 characters becomes that token. A shorter paste stays inline.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['ChatComposerInput'],
};
