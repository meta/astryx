// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export default {
  type: 'block',
  name: 'Podcast episode',
  displayName: 'Podcast episode',
  description:
    'An episode player in a Section container: title, timeline, a speed menu, skip back 15 and forward 30 seconds, and a volume slider that appears while the volume control is hovered or focused.',
  exampleFor: 'AudioPlayer',
  alsoExampleFor: [
    'MediaPlayerAudio',
    'MediaSeekButton',
    'MediaPlaybackRateMenu',
  ],
  isReady: true,
  isShowcase: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['AudioPlayer', 'VStack'],
};
