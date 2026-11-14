// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useChatPasteAsToken',
  name: 'useChatPasteAsToken — Long paste',
  displayName: 'useChatPasteAsToken — Long paste',
  description:
    'Connect useChatPasteAsToken to ChatComposerInput so pastes from 81 to 200 characters become a labeled token, pastes over 200 characters use the composer’s standard expandable text chip, and shorter text stays inline.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['ChatComposer', 'ChatComposerInput', 'Layout'],
};
