// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useDragToSnapPoints',
  name: 'useDragToSnapPoints — Playing card on three places',
  displayName: 'useDragToSnapPoints — Playing card on three places',
  description:
    'A playing card that a sideways drag moves between three places: a slow release settles on the nearest, a quick flick carries to the next, and a release moving back returns where it started. Buttons settle it from the keyboard, and the new place is announced. Built only on the public useDragToSnapPoints hook.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: [
    'Card',
    'Button',
    'Layout',
    'Text',
    'VisuallyHidden',
    'useDragToSnapPoints',
  ],
};
