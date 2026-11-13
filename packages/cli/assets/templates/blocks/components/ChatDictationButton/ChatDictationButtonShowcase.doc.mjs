// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'ChatDictationButton',
  name: 'ChatDictationButton',
  displayName: 'Chat Dictation Button',
  description: 'Interactive dictation button connected to the SpeechRecognition API via useChatDictation. Click the mic to dictate into the composer.',
  isReady: true,
  isShowcase: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['Chat', 'ChatDictationButton', 'ChatComposer', 'ChatComposerInput'],
  fits: ['chat', 'inline'],
};
