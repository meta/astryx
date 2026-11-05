// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export default {
  type: 'block',
  name: 'Custom layout',
  displayName: 'Custom layout',
  description:
    'A one-row player built from the parts, with the speed as a menu and Mute with its volume slider. Every part reads the MediaPlayer around it, and useMediaPlayer turns the playback state into a custom readout.',
  exampleFor: 'MediaPlayer',
  alsoExampleFor: ['useMediaPlayer', 'MediaPlaybackRate', 'MediaPlayerElement'],
  isReady: true,
  isShowcase: true,
  aspectRatio: 16 / 9,
  componentsUsed: [
    'MediaPlayer',
    'MediaPlayerElement',
    'MediaPlayButton',
    'MediaTimeSlider',
    'MediaTime',
    'MediaPlaybackRate',
    'MediaVolume',
    'HStack',
    'VStack',
    'Text',
  ],
};
