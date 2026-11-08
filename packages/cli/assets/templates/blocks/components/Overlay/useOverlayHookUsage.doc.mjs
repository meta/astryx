// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useOverlay',
  name: 'useOverlay — Product Quick View',
  displayName: 'useOverlay — Product Quick View',
  description:
    'A product card that is its own overlay container: useOverlay returns the ref and props to spread on the Card and a bottom strip to render once over the image. Hovering the card, or moving keyboard focus into it, slides in a Quick view button along the bottom of the image, and leaving hides it again. The image is a link that the strip leaves clickable above it, and Tab lands on it first so the next Tab reaches Quick view.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: [
    'Overlay',
    'Card',
    'AspectRatio',
    'Button',
    'Layout',
    'Text',
  ],
};
