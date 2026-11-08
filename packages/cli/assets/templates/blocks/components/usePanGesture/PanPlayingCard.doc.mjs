// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'usePanGesture',
  name: 'usePanGesture — A playing card (advanced)',
  displayName: 'usePanGesture — A playing card (advanced)',
  description:
    'An advanced usePanGesture example: a playing card follows a drag, settles back on a gentle release and flies off on a quick flick, while a Discard button deals the next card from the keyboard and announces it. Drag, settle and throw are StyleX styles driven by React state. A pattern for swipe-to-dismiss, card decks and flick gestures.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Button', 'Card', 'Center', 'Text', 'VStack'],
};
