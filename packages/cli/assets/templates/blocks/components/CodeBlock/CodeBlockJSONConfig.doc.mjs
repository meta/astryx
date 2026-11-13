// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'CodeBlock',
  name: 'Code — Config',
  displayName: 'Code — Config',
  description:
    'A JSON configuration file with a title bar and line numbers. The title prop adds a filename label in the header so readers know which file the code belongs to.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['CodeBlock'],
  fits: ['content'],
};
