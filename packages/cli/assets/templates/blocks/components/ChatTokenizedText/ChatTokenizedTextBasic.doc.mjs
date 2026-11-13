// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'ChatTokenizedText',
  name: 'ChatTokenizedText — Basic',
  displayName: 'ChatTokenizedText — Basic',
  description: 'A message with @mention tokens. Each matching pattern is replaced with its display name badge.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['ChatTokenizedText', 'Chat'],
  fits: ['chat', 'inline'],
};
