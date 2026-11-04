// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export default {
  type: 'block',
  name: 'Custom layout',
  displayName: 'Custom layout',
  description:
    'A one-row player built from the parts, with the speed as a menu. Every part reads the MediaPlayer around it, and useMediaPlayer turns the playback state into a custom readout.',
  exampleFor: 'MediaPlayer',
  alsoExampleFor: ['useMediaPlayer', 'MediaPlaybackRateMenu'],
  isReady: true,
  isShowcase: true,
  aspectRatio: 16 / 9,
  componentsUsed: [
    'MediaPlayer',
    'MediaPlayerAudio',
    'MediaPlayButton',
    'MediaTimeSlider',
    'MediaTime',
    'MediaPlaybackRateMenu',
    'MediaMuteButton',
    'HStack',
    'VStack',
    'Text',
  ],
};
