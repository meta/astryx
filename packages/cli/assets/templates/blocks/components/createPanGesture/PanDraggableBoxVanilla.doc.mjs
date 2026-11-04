// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'createPanGesture',
  name: 'createPanGesture — A draggable box without React',
  displayName: 'createPanGesture — A draggable box without React',
  description:
    'The smallest createPanGesture example: the same draggable card as the usePanGesture one, with the pan created on the element itself. createPanGesture takes any element, React or not; here a callback ref creates the pan and its cleanup destroys it. A starting point for drag-and-release gestures outside a hook.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Card', 'Center'],
};
