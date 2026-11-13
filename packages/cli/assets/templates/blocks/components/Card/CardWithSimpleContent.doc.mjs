// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'Card',
  name: 'Card — Simple',
  displayName: 'Card — Simple',
  description: 'A card with a heading and body text. Use for summaries, descriptions, or any grouped content that needs visual separation from the page. The card handles its own border, background, and padding; just pass your content as children. Set a width to constrain it, or leave it to fill the parent.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['Card', 'Layout', 'Text'],
  fits: ['content', 'list'],
};
