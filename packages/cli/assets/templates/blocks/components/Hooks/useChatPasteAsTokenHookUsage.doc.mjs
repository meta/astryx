// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useChatPasteAsToken',
  name: 'useChatPasteAsToken — Log Paste',
  displayName: 'useChatPasteAsToken — Log Paste',
  description:
    'A composer wired to useChatPasteAsToken at a 120-character threshold: copy the build log, paste it, and it arrives as one token chip - while a short paste still inserts as plain text.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: [
    'ChatComposer',
    'ChatComposerInput',
    'Card',
    'Button',
    'Layout',
    'Text',
  ],
};
