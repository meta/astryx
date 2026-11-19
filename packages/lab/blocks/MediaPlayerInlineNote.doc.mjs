// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export default {
  type: 'block',
  name: 'Inline voice note',
  displayName: 'Inline voice note',
  description:
    'The smallest useful player for a message thread: one play button and the time left.',
  exampleFor: 'MediaPlayer',
  isReady: true,
  isShowcase: false,
  aspectRatio: 16 / 9,
  componentsUsed: [
    'MediaPlayer',
    'MediaPlayerElement',
    'MediaPlayButton',
    'MediaTime',
    'HStack',
  ],
};
