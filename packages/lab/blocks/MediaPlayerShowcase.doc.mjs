// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export default {
  type: 'block',
  name: 'Custom layout',
  displayName: 'Custom layout',
  description:
    'A one-row player built from the parts. Every part reads the MediaPlayer around it, and useMediaPlayer turns the playback state into a custom readout.',
  exampleFor: 'MediaPlayer',
  alsoExampleFor: ['useMediaPlayer'],
  isReady: true,
  isShowcase: true,
  aspectRatio: 16 / 9,
  componentsUsed: [
    'MediaPlayer',
    'MediaPlayerAudio',
    'MediaPlayButton',
    'MediaTimeSlider',
    'MediaTime',
    'MediaMuteButton',
    'HStack',
    'VStack',
    'Text',
  ],
};
