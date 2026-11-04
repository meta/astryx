// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useOverlay',
  name: 'useOverlay — Product Quick View',
  displayName: 'useOverlay — Product Quick View',
  description:
    'A product card that is its own overlay container: useOverlay returns the ref and props to spread on the Card and the scrim to render once over the image. Hovering the card, or moving keyboard focus into it, reveals a Quick view button over the scrim, and leaving hides it again. The image is a link, so Tab lands on it first and the next Tab reaches Quick view.',
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
