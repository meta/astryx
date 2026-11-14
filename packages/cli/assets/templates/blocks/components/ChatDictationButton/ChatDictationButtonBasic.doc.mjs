// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'ChatDictationButton',
  alsoExampleFor: ['useChatDictation'],
  name: 'ChatDictationButton — Basic',
  displayName: 'ChatDictationButton — Basic',
  description:
    'A dictation button wired to useChatDictation and placed in the sendActions slot of a ChatComposer. Click the microphone to transcribe speech into the input.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: [
    'Chat',
    'ChatDictationButton',
    'ChatComposer',
    'ChatComposerInput',
  ],
};
