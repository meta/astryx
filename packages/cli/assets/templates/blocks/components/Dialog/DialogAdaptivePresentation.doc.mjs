// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'Dialog',
  alsoExampleFor: ['BottomSheet', 'useMediaQuery'],
  name: 'Dialog — Adaptive presentation',
  displayName: 'Dialog — Adaptive presentation',
  description:
    'Opt-in recipe for an AdaptiveDialog wrapper: Dialog remains the default everywhere, while touchPresentation="bottom-sheet" switches only at lg and below when pointer is coarse and hover is unavailable. Includes a deterministic presentation override for tests/unusual environments and notes that BottomSheet purpose controls swipe and scrim dismissal. Usage examples: touchPresentation="dialog" keeps Dialog, "fullscreen" chooses fullscreen Dialog, and "bottom-sheet" chooses BottomSheet only for the touch-oriented range. Keep presentation as the deterministic override. Do not use this by default for AlertDialog or destructive confirmations.',
  isReady: true,
  aspectRatio: 3 / 4,
  componentsUsed: [
    'Dialog',
    'DialogHeader',
    'BottomSheet',
    'Layout',
    'Button',
    'Text',
    'TextInput',
    'TextArea',
    'useMediaQuery',
  ],
  fits: ['overlay', 'form'],
};
