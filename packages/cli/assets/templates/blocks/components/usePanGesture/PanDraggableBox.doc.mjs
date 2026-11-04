// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'usePanGesture',
  alsoExampleFor: ['createPanGesture'],
  name: 'usePanGesture — A draggable box',
  displayName: 'usePanGesture — A draggable box',
  description:
    'The smallest pan example, in two forms side by side: the usePanGesture hook and the createPanGesture factory. The factory takes any element, React or not. Each card names its API, follows a drag from a finger, a mouse or a pen, and springs back, with the same StyleX styles. A starting point for a draggable tile, a swipe or any drag-and-release gesture.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Card', 'Center', 'HStack'],
};
