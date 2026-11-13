// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'ChatComposer',
  name: 'ChatComposer — Streaming',
  displayName: 'ChatComposer — Streaming',
  description: 'Chat composer with streaming state and a stop button. Use when the assistant is generating a response and the user can cancel.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['ChatComposer', 'Layout', 'Text'],
  fits: ['chat'],
};
