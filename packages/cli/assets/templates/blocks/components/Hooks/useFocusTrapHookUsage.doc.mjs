// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useFocusTrap',
  name: 'useFocusTrap — Quick Edit Panel',
  displayName: 'useFocusTrap — Quick Edit Panel',
  description:
    'A custom quick-edit panel, not built on Dialog, that traps focus with useFocusTrap: focusFirst moves focus to its field on open, Tab and Shift+Tab stay inside it, Escape closes it through onEscape, and closing returns focus to the Quick edit button.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Card', 'Button', 'TextInput', 'Text', 'Layout'],
};
