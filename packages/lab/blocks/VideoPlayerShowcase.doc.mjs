// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export default {
  type: 'block',
  name: 'Video player',
  displayName: 'Video player',
  description:
    'A video with themed controls in a frosted bar that floats 8px inside the video. The bar shows on hover, pointer movement, and keyboard focus, hides after two idle seconds while the video plays, and on touch shows and hides with a tap.',
  exampleFor: 'VideoPlayer',
  alsoExampleFor: [
    'MediaPlayButton',
    'MediaTimeSlider',
    'MediaTime',
    'MediaVolume',
    'MediaFullscreenButton',
  ],
  isReady: true,
  isShowcase: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['VideoPlayer', 'VStack'],
};
