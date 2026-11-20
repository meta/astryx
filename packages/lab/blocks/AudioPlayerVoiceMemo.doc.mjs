// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export default {
  type: 'block',
  name: 'Voice memo',
  displayName: 'Voice memo',
  description:
    'A short recording with 5 and 10 second skips, which suit a clip measured in seconds rather than minutes.',
  exampleFor: 'AudioPlayer',
  isReady: true,
  isShowcase: false,
  aspectRatio: 16 / 9,
  componentsUsed: ['AudioPlayer', 'VStack'],
};
