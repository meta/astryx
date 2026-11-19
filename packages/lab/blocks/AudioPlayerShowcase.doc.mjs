// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export default {
  type: 'block',
  name: 'Podcast episode',
  displayName: 'Podcast episode',
  description:
    'An episode player in a Section container: title, timeline, skip back 15 and forward 30 seconds, and speed and volume buttons whose sliders open while the button is hovered or focused.',
  exampleFor: 'AudioPlayer',
  alsoExampleFor: ['MediaSeekButton'],
  isReady: true,
  isShowcase: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['AudioPlayer', 'VStack'],
};
