// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'DropdownMenu',
  alsoExampleFor: ['BottomSheet', 'useMediaQuery'],
  name: 'DropdownMenu — Adaptive presentation',
  displayName: 'DropdownMenu — Adaptive presentation',
  description:
    'Chooses a bottom sheet for compact touch surfaces and an anchored popover otherwise. The media query is product policy, while DropdownMenu owns both presentations.',
  isReady: true,
  aspectRatio: 3 / 4,
  componentsUsed: ['DropdownMenu', 'Stack', 'Text', 'useMediaQuery'],
};
