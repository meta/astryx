// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'ChatComposer',
  name: 'ChatComposer — Attachments',
  displayName: 'ChatComposer — Attachments',
  description: 'Chat composer with removable file tokens in a collapsible drawer. Use when users can attach files or context to their message.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['ChatComposer', 'Token', 'Layout'],
  fits: ['chat'],
};
