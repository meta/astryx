// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'ChatSendButton',
  name: 'ChatSendButton — In Composer',
  displayName: 'ChatSendButton — In Composer',
  description: 'Send button inside ChatComposer, where it reads state from context automatically. No wiring needed; the button enables when the input has content.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['Chat', 'ChatComposer', 'ChatSendButton', 'Layout'],
  fits: ['chat', 'form'],
};
