// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useSyntaxTheme',
  name: 'useSyntaxTheme — Canvas Code View',
  displayName: 'useSyntaxTheme — Canvas Code View',
  description:
    'A canvas that paints a few lines of code with useSyntaxTheme token values - keyword, string and comment colors resolved from the SyntaxTheme provider - and falls back to a note when no provider is above it.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['SyntaxTheme', 'Card', 'Text', 'Layout'],
};
