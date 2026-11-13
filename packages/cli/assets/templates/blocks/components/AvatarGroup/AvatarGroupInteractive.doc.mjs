// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'AvatarGroup',
  name: 'AvatarGroup — Interactive',
  displayName: 'Avatar Group — Interactive',
  description:
    'A facepile whose avatars link to profiles, with an overflow indicator that opens the full member list. The whole group is one Tab stop; arrow keys move between the avatars and the overflow button.',
  isReady: true,
  isShowcase: false,
  aspectRatio: 16 / 9,
  componentsUsed: ['AvatarGroup', 'Avatar', 'Layout', 'Text'],
  fits: ['inline'],
};
