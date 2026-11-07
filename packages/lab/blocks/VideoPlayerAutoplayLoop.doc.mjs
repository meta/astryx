// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export default {
  type: 'block',
  name: 'Muted autoplay loop',
  displayName: 'Muted autoplay loop',
  description:
    'An ambient clip that starts muted on load and loops. Its pause control stays one press away, because it moves for longer than five seconds.',
  exampleFor: 'VideoPlayer',
  isReady: true,
  isShowcase: false,
  aspectRatio: 16 / 9,
  componentsUsed: ['VideoPlayer', 'VStack'],
};
