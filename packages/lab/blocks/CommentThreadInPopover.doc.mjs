// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export default {
  type: 'block',
  name: 'In a popover',
  displayName: 'In a popover',
  description:
    'Open one thread from a passage in a Popover with no padding. The thread owns the Popover’s dismissal through `onDismiss`, so turn the Popover’s light and Escape dismissal off: a press outside or Escape closes the thread, but the first one over an unsaved reply shakes it and keeps the draft.',
  exampleFor: 'CommentThread',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: [
    'CommentThread',
    'Popover',
    'Button',
    'Card',
    'Text',
    'VStack',
  ],
};
