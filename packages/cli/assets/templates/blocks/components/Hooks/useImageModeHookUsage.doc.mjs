// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useImageMode',
  name: 'useImageMode — Photo Caption',
  displayName: 'useImageMode — Photo Caption',
  description:
    'A photo banner with a caption over the sky. useImageMode samples only the strip under the caption and MediaTheme switches the caption between light and dark text from the result. A Beach photo switch swaps a night photo for a bright beach photo, and while the new photo loads the caption keeps the dark fallback.',
  isReady: true,
  aspectRatio: 3 / 2,
  componentsUsed: ['AspectRatio', 'MediaTheme', 'Switch', 'Text', 'Layout'],
};
