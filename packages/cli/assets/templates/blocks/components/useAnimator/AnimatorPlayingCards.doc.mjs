// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useAnimator',
  name: 'useAnimator — Playing cards',
  displayName: 'useAnimator — Playing cards',
  description:
    'A playing card that follows a drag: a gentle release springs it back on its release velocity, and a quick flick throws it away with momentum before the next card is dealt. A Discard button moves it off from the keyboard, fading it in place under Reduce Motion, and the discard is announced. Built only on the public useAnimator hook.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: [
    'Card',
    'Button',
    'Layout',
    'Text',
    'VisuallyHidden',
    'useAnimator',
  ],
};
