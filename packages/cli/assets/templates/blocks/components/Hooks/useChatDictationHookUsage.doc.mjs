// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useChatDictation',
  name: 'useChatDictation — Dictating Composer',
  displayName: 'useChatDictation — Dictating Composer',
  description:
    'A composer whose voice input is driven by useChatDictation: ChatDictationButton starts and stops it, interim text lands as ghost text through inputRef, and the meter shows the live volume the hook reports.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: [
    'ChatComposer',
    'ChatComposerInput',
    'ChatDictationButton',
    'Card',
    'Layout',
    'Text',
  ],
};
